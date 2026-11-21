package community

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Cho phép kết nối từ mọi frontend origin hợp lệ
	},
}

// WSMessage định dạng gói tin trao đổi qua WebSocket
type WSMessage struct {
	Type    string      `json:"type"`              // "new_message", "online_count", "ping", "pong"
	Data    interface{} `json:"data,omitempty"`
	Count   int         `json:"count,omitempty"`
	Message string      `json:"message,omitempty"`
}

// Client đại diện cho 1 kết nối WebSocket của người dùng
type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	send      chan []byte
	userID    uint
	username  string
	avatarURL string
	role      string
	isVIP     bool
}

// Hub quản lý tập trung toàn bộ kết nối WebSocket và broadcast tin nhắn
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func NewHub() *Hub {
	h := &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
	go h.run()
	return h
}

func (h *Hub) fanOutLocked(message []byte) {
	for client := range h.clients {
		select {
		case client.send <- message:
		default:
			close(client.send)
			delete(h.clients, client)
		}
	}
}

func (h *Hub) fanOutOnlineCountLocked() {
	bytes, err := json.Marshal(WSMessage{
		Type:  "online_count",
		Count: len(h.clients),
	})
	if err != nil {
		return
	}
	h.fanOutLocked(bytes)
}

func (h *Hub) run() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			count := len(h.clients)
			h.fanOutOnlineCountLocked()
			h.mu.Unlock()

			slog.Info("Người dùng đã kết nối Community WebSocket", "user", client.username, "online", count)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			count := len(h.clients)
			h.fanOutOnlineCountLocked()
			h.mu.Unlock()

			slog.Info("Người dùng ngắt kết nối Community WebSocket", "user", client.username, "online", count)

		case message := <-h.broadcast:
			h.mu.Lock()
			h.fanOutLocked(message)
			h.mu.Unlock()

		case <-ticker.C:
			h.mu.Lock()
			h.fanOutOnlineCountLocked()
			h.mu.Unlock()
		}
	}
}

// Broadcast gửi dữ liệu đến toàn bộ client đang online (non-blocking tránh deadlock khi kênh đầy)
func (h *Hub) Broadcast(msg WSMessage) {
	bytes, err := json.Marshal(msg)
	if err != nil {
		slog.Error("Lỗi serialize WSMessage", "error", err)
		return
	}
	select {
	case h.broadcast <- bytes:
	default:
		slog.Warn("Kênh broadcast Community WebSocket đang đầy, bỏ qua gói tin")
	}
}

// BroadcastOnlineCount phát số lượng độc giả đang trực tuyến thực tế
func (h *Hub) BroadcastOnlineCount(count int) {
	h.Broadcast(WSMessage{
		Type:  "online_count",
		Count: count,
	})
}

// OnlineCount trả về số client thực tế
func (h *Hub) OnlineCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// readPump lắng nghe gói tin từ client (như ping, chat)
func (c *Client) readPump(onMessage func(c *Client, data []byte)) {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Warn("WebSocket đóng bất ngờ", "error", err)
			}
			break
		}
		if onMessage != nil {
			onMessage(c, message)
		}
	}
}

// writePump gửi tin từ chan send tới websocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			// Gộp các tin nhắn đang chờ trong buffer
			n := len(c.send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
