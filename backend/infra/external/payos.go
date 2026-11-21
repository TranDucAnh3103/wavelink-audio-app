package external

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

const DefaultPayOSBaseURL = "https://api-merchant.payos.vn"

// PayOSClient handles PayOS API v2 payment-requests and webhook signature verification.
type PayOSClient struct {
	ClientID    string
	APIKey      string
	ChecksumKey string
	BaseURL     string
	HTTPClient  *http.Client
}

func NewPayOSClient(clientID, apiKey, checksumKey string) *PayOSClient {
	return &PayOSClient{
		ClientID:    strings.TrimSpace(clientID),
		APIKey:      strings.TrimSpace(apiKey),
		ChecksumKey: strings.TrimSpace(checksumKey),
		BaseURL:     DefaultPayOSBaseURL,
		HTTPClient:  &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *PayOSClient) IsConfigured() bool {
	return c != nil && c.ClientID != "" && c.APIKey != "" && c.ChecksumKey != ""
}

type PayOSItem struct {
	Name     string `json:"name"`
	Quantity int    `json:"quantity"`
	Price    int    `json:"price"`
}

type PayOSCreatePaymentRequest struct {
	OrderCode   int64       `json:"orderCode"`
	Amount      int         `json:"amount"`
	Description string      `json:"description"`
	BuyerName   string      `json:"buyerName,omitempty"`
	BuyerEmail  string      `json:"buyerEmail,omitempty"`
	Items       []PayOSItem `json:"items,omitempty"`
	CancelURL   string      `json:"cancelUrl"`
	ReturnURL   string      `json:"returnUrl"`
	ExpiredAt   int64       `json:"expiredAt,omitempty"`
	Signature   string      `json:"signature"`
}

type PayOSPaymentData struct {
	BIN           string `json:"bin"`
	AccountNumber string `json:"accountNumber"`
	AccountName   string `json:"accountName"`
	Amount        int    `json:"amount"`
	Description   string `json:"description"`
	OrderCode     int64  `json:"orderCode"`
	Currency      string `json:"currency"`
	PaymentLinkID string `json:"paymentLinkId"`
	Status        string `json:"status"`
	CheckoutURL   string `json:"checkoutUrl"`
	QRCode        string `json:"qrCode"`
}

type PayOSOrderInfo struct {
	ID                 string `json:"id"`
	OrderCode          int64  `json:"orderCode"`
	Amount             int    `json:"amount"`
	AmountPaid         int    `json:"amountPaid"`
	AmountRemaining    int    `json:"amountRemaining"`
	Status             string `json:"status"` // PENDING, PAID, PROCESSING, CANCELLED, EXPIRED
	CreatedAt          string `json:"createdAt"`
	CancellationReason string `json:"cancellationReason,omitempty"`
}

type payOSCreateResponse struct {
	Code      string            `json:"code"`
	Desc      string            `json:"desc"`
	Data      *PayOSPaymentData `json:"data"`
	Signature string            `json:"signature"`
}

type payOSOrderResponse struct {
	Code string          `json:"code"`
	Desc string          `json:"desc"`
	Data *PayOSOrderInfo `json:"data"`
}

// SanitizePayOSDescription keeps description ASCII-safe and <= 25 chars (PayOS limit for standard bank channels).
func SanitizePayOSDescription(desc string) string {
	cleaned := strings.TrimSpace(desc)
	if len(cleaned) > 25 {
		cleaned = strings.TrimSpace(cleaned[:25])
	}
	return cleaned
}

// SignPaymentRequest generates PayOS v2 HMAC-SHA256 signature over alphabetical canonical fields.
func (c *PayOSClient) SignPaymentRequest(amount int, cancelURL, description string, orderCode int64, returnURL string) string {
	canonical := fmt.Sprintf(
		"amount=%d&cancelUrl=%s&description=%s&orderCode=%d&returnUrl=%s",
		amount,
		cancelURL,
		description,
		orderCode,
		returnURL,
	)
	mac := hmac.New(sha256.New, []byte(c.ChecksumKey))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

// CreatePaymentLink creates a payment request on PayOS v2 and returns checkoutUrl + VietQR EMV qrCode.
func (c *PayOSClient) CreatePaymentLink(req PayOSCreatePaymentRequest) (*PayOSPaymentData, error) {
	if !c.IsConfigured() {
		return nil, fmt.Errorf("payOS chưa được cấu hình đầy đủ (thiếu Client ID, API Key hoặc Checksum Key)")
	}

	req.Description = SanitizePayOSDescription(req.Description)
	req.Signature = c.SignPaymentRequest(req.Amount, req.CancelURL, req.Description, req.OrderCode, req.ReturnURL)

	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("không thể mã hóa yêu cầu payOS: %w", err)
	}

	baseURL := strings.TrimRight(c.BaseURL, "/")
	if baseURL == "" {
		baseURL = DefaultPayOSBaseURL
	}

	httpReq, err := http.NewRequest(http.MethodPost, baseURL+"/v2/payment-requests", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-client-id", c.ClientID)
	httpReq.Header.Set("x-api-key", c.APIKey)

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối tới cổng thanh toán payOS: %w", err)
	}
	defer resp.Body.Close()

	rawResp, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc phản hồi payOS: %w", err)
	}

	var parsed payOSCreateResponse
	if err := json.Unmarshal(rawResp, &parsed); err != nil {
		return nil, fmt.Errorf("phản hồi payOS không hợp lệ (HTTP %d): %s", resp.StatusCode, string(rawResp))
	}

	if resp.StatusCode >= 400 || parsed.Code != "00" || parsed.Data == nil {
		msg := parsed.Desc
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("payOS từ chối tạo mã thanh toán [%s]: %s", parsed.Code, msg)
	}

	return parsed.Data, nil
}

// GetPaymentLinkInfo queries live payment status for an orderCode directly from PayOS v2.
func (c *PayOSClient) GetPaymentLinkInfo(orderCode int64) (*PayOSOrderInfo, error) {
	if !c.IsConfigured() {
		return nil, fmt.Errorf("payOS chưa được cấu hình")
	}

	baseURL := strings.TrimRight(c.BaseURL, "/")
	if baseURL == "" {
		baseURL = DefaultPayOSBaseURL
	}

	httpReq, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/v2/payment-requests/%d", baseURL, orderCode), nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("x-client-id", c.ClientID)
	httpReq.Header.Set("x-api-key", c.APIKey)

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn trạng thái payOS: %w", err)
	}
	defer resp.Body.Close()

	rawResp, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	var parsed payOSOrderResponse
	if err := json.Unmarshal(rawResp, &parsed); err != nil {
		return nil, fmt.Errorf("phản hồi trạng thái payOS không hợp lệ: %w", err)
	}

	if resp.StatusCode >= 400 || parsed.Code != "00" || parsed.Data == nil {
		return nil, fmt.Errorf("payOS trả về lỗi [%s]: %s", parsed.Code, parsed.Desc)
	}

	return parsed.Data, nil
}

// CancelPaymentLink cancels a pending payment link on PayOS v2.
func (c *PayOSClient) CancelPaymentLink(orderCode int64, reason string) error {
	if !c.IsConfigured() {
		return fmt.Errorf("payOS chưa được cấu hình")
	}

	baseURL := strings.TrimRight(c.BaseURL, "/")
	if baseURL == "" {
		baseURL = DefaultPayOSBaseURL
	}

	payload, _ := json.Marshal(map[string]string{
		"cancellationReason": reason,
	})
	httpReq, err := http.NewRequest(
		http.MethodPost,
		fmt.Sprintf("%s/v2/payment-requests/%d/cancel", baseURL, orderCode),
		bytes.NewReader(payload),
	)
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-client-id", c.ClientID)
	httpReq.Header.Set("x-api-key", c.APIKey)

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	return nil
}

func formatPayOSWebhookValue(val interface{}) string {
	if val == nil {
		return ""
	}
	switch v := val.(type) {
	case string:
		if v == "null" || v == "undefined" {
			return ""
		}
		return v
	case json.Number:
		return v.String()
	case float64:
		if v == float64(int64(v)) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case bool:
		return strconv.FormatBool(v)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(b)
	}
}

// ComputeWebhookSignature builds the canonical PayOS HMAC-SHA256 hex digest over sorted data keys.
func (c *PayOSClient) ComputeWebhookSignature(data map[string]interface{}) string {
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%s", k, formatPayOSWebhookValue(data[k])))
	}
	canonical := strings.Join(parts, "&")

	mac := hmac.New(sha256.New, []byte(c.ChecksumKey))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyWebhookSignature validates the incoming PayOS webhook HMAC-SHA256 signature in constant time.
func (c *PayOSClient) VerifyWebhookSignature(data map[string]interface{}, signature string) bool {
	if !c.IsConfigured() || signature == "" || len(data) == 0 {
		return false
	}
	expected := c.ComputeWebhookSignature(data)
	return hmac.Equal([]byte(strings.ToLower(expected)), []byte(strings.ToLower(strings.TrimSpace(signature))))
}

var vnBankByBIN = map[string]string{
	"970422": "MB Bank (Quân Đội)",
	"970436": "Vietcombank",
	"970407": "Techcombank",
	"970415": "VietinBank",
	"970418": "BIDV",
	"970416": "ACB",
	"970432": "VPBank",
	"970423": "TPBank",
	"970403": "Sacombank",
	"970405": "Agribank",
	"970448": "OCB",
	"970437": "HDBank",
	"970441": "VIB",
	"970426": "MSB",
	"970443": "SHB",
	"970454": "BVBank / Timo",
	"970429": "SCB",
	"970431": "Eximbank",
	"970428": "Nam A Bank",
	"970449": "LPBank",
	"970440": "SeABank",
	"970425": "ABBank",
	"970412": "PVcomBank",
	"970409": "Bac A Bank",
	"970419": "NCB",
	"970452": "KienlongBank",
	"546034": "CAKE by VPBank",
	"546035": "Ubank by VPBank",
	"963388": "Timo Digital Bank",
}

func ResolveBankNameByBIN(bin string, fallback string) string {
	if name, ok := vnBankByBIN[strings.TrimSpace(bin)]; ok {
		return name
	}
	if fallback != "" {
		return fallback
	}
	if bin != "" {
		return "Ngân hàng (BIN " + bin + ")"
	}
	return "VietQR / payOS"
}
