package external

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPayOSClient_SignAndVerifyWebhook(t *testing.T) {
	client := NewPayOSClient("cid-1", "apikey-1", "test-checksum-secret-key-64-chars-example")

	sig := client.SignPaymentRequest(
		49000,
		"https://example.com/cancel",
		"WL VIP 1M 123456",
		1711234567,
		"https://example.com/return",
	)
	if len(sig) != 64 {
		t.Fatalf("expected 64-char hex HMAC-SHA256 signature, got len=%d (%s)", len(sig), sig)
	}

	webhookData := map[string]interface{}{
		"orderCode":           json.Number("1711234567"),
		"amount":              json.Number("49000"),
		"description":         "WL VIP 1M 123456",
		"accountNumber":       "0123456789",
		"reference":           "FT2611210001",
		"transactionDateTime": "2026-11-21 17:15:00",
		"currency":            "VND",
		"paymentLinkId":       "pl-abc123",
		"code":                "00",
		"desc":                "Thành công",
		"counterAccountName":  nil,
	}

	validSig := client.ComputeWebhookSignature(webhookData)
	if !client.VerifyWebhookSignature(webhookData, validSig) {
		t.Fatalf("expected valid webhook signature to verify")
	}

	// Tampered amount must fail verification
	webhookData["amount"] = json.Number("1000")
	if client.VerifyWebhookSignature(webhookData, validSig) {
		t.Fatalf("expected tampered webhook payload to fail signature verification")
	}
}

func TestPayOSClient_CreateAndQueryPaymentLink(t *testing.T) {
	var receivedClientID, receivedAPIKey string
	var receivedBody PayOSCreatePaymentRequest

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedClientID = r.Header.Get("x-client-id")
		receivedAPIKey = r.Header.Get("x-api-key")

		if r.Method == http.MethodPost && r.URL.Path == "/v2/payment-requests" {
			if err := json.NewDecoder(r.Body).Decode(&receivedBody); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"code": "00",
				"desc": "success",
				"data": map[string]interface{}{
					"bin":           "970422",
					"accountNumber": "0987654321",
					"accountName":   "TRAN DUC ANH",
					"amount":        receivedBody.Amount,
					"description":   receivedBody.Description,
					"orderCode":     receivedBody.OrderCode,
					"currency":      "VND",
					"paymentLinkId": "plink-999",
					"status":        "PENDING",
					"checkoutUrl":   "https://pay.payos.vn/web/plink-999",
					"qrCode":        "00020101021238570010A0000007270127000697042201100987654321",
				},
			})
			return
		}

		if r.Method == http.MethodGet && r.URL.Path == "/v2/payment-requests/123456789" {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"code": "00",
				"desc": "success",
				"data": map[string]interface{}{
					"id":              "plink-999",
					"orderCode":       123456789,
					"amount":          49000,
					"amountPaid":      49000,
					"amountRemaining": 0,
					"status":          "PAID",
				},
			})
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	client := NewPayOSClient("client-id-xyz", "api-key-xyz", "checksum-key-xyz")
	client.BaseURL = srv.URL

	created, err := client.CreatePaymentLink(PayOSCreatePaymentRequest{
		OrderCode:   123456789,
		Amount:      49000,
		Description: "WL VIP 1M 123456789 LONG TEXT EXCEEDING 25 CHARS",
		ReturnURL:   "https://app.local/membership?payment=success",
		CancelURL:   "https://app.local/membership?payment=cancelled",
	})
	if err != nil {
		t.Fatalf("CreatePaymentLink failed: %v", err)
	}
	if receivedClientID != "client-id-xyz" || receivedAPIKey != "api-key-xyz" {
		t.Fatalf("unexpected headers: %s / %s", receivedClientID, receivedAPIKey)
	}
	if len(receivedBody.Description) > 25 {
		t.Fatalf("expected description truncated to <=25 chars, got %d (%q)", len(receivedBody.Description), receivedBody.Description)
	}
	if created.CheckoutURL != "https://pay.payos.vn/web/plink-999" || created.QRCode == "" {
		t.Fatalf("unexpected created payment data: %+v", created)
	}

	info, err := client.GetPaymentLinkInfo(123456789)
	if err != nil {
		t.Fatalf("GetPaymentLinkInfo failed: %v", err)
	}
	if info.Status != "PAID" || info.AmountPaid != 49000 {
		t.Fatalf("unexpected order info: %+v", info)
	}
}
