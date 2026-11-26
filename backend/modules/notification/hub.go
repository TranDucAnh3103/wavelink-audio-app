package notification

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	wsWriteWait  = 10 * time.Second
	wsPongWait   = 60 * time.Second
	wsPingPeriod = (wsPongWait * 9) / 10
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  512,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type wsEnvelope struct {
	Type string      `json:"type"`
	Data interface{} `json:"data,omitempty"`
}

type wsClient struct {
	hub    *Hub
	conn   *websocket.Conn
	userID uint
	send   chan []byte
}

// Hub maintains active per-user WebSocket connections for instant notification delivery.
type Hub struct {
	mu      sync.RWMutex
	clients map[uint]map[*wsClient]bool
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[uint]map[*wsClient]bool),
	}
}

var (
	defaultHubMu sync.RWMutex
	defaultHub   *Hub
)

func setDefaultHub(h *Hub) {
	defaultHubMu.Lock()
	defaultHub = h
	defaultHubMu.Unlock()
}

func getDefaultHub() *Hub {
	defaultHubMu.RLock()
	h := defaultHub
	defaultHubMu.RUnlock()
	return h
}

func (h *Hub) register(c *wsClient) {
	h.mu.Lock()
	if h.clients[c.userID] == nil {
		h.clients[c.userID] = make(map[*wsClient]bool)
	}
	h.clients[c.userID][c] = true
	h.mu.Unlock()
}

func (h *Hub) unregister(c *wsClient) {
	h.mu.Lock()
	if set, ok := h.clients[c.userID]; ok {
		if _, exists := set[c]; exists {
			delete(set, c)
			close(c.send)
		}
		if len(set) == 0 {
			delete(h.clients, c.userID)
		}
	}
	h.mu.Unlock()
}

// PushToUser delivers a notification payload to all active WebSocket tabs of a user.
func (h *Hub) PushToUser(userID uint, notif domain.Notification) {
	if h == nil || userID == 0 {
		return
	}
	bytes, err := json.Marshal(wsEnvelope{
		Type: "notification",
		Data: notif,
	})
	if err != nil {
		return
	}

	h.mu.RLock()
	set := h.clients[userID]
	targets := make([]*wsClient, 0, len(set))
	for c := range set {
		targets = append(targets, c)
	}
	h.mu.RUnlock()

	for _, c := range targets {
		select {
		case c.send <- bytes:
		default:
			slog.Debug("Notification WebSocket buffer full, dropping push", "userId", userID)
		}
	}
}

func (h *Handler) HandleWebSocket(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	if userID == 0 {
		response.Unauthorized(c, "Vui lòng đăng nhập để nhận thông báo realtime")
		return
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := &wsClient{
		hub:    h.hub,
		conn:   conn,
		userID: userID,
		send:   make(chan []byte, 32),
	}
	h.hub.register(client)

	go client.writePump()
	go client.readPump()
}

func (c *wsClient) readPump() {
	defer func() {
		c.hub.unregister(c)
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(1024)
	_ = c.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		var ping struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(msg, &ping) == nil && ping.Type == "ping" {
			pong, _ := json.Marshal(wsEnvelope{Type: "pong"})
			select {
			case c.send <- pong:
			default:
			}
		}
	}
}

func (c *wsClient) writePump() {
	ticker := time.NewTicker(wsPingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(msg)
			n := len(c.send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.send)
			}
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
