package stream

import "sync"

// ConcurrencyLimiter caps active simultaneous streams per user/guest subject.
type ConcurrencyLimiter struct {
	maxPerKey int
	mu        sync.Mutex
	active    map[string]int
}

func NewConcurrencyLimiter(maxPerKey int) *ConcurrencyLimiter {
	return &ConcurrencyLimiter{
		maxPerKey: maxPerKey,
		active:    make(map[string]int),
	}
}

func (l *ConcurrencyLimiter) Acquire(key string) (func(), bool) {
	if l == nil || l.maxPerKey <= 0 {
		return func() {}, true
	}

	l.mu.Lock()
	cur := l.active[key]
	if cur >= l.maxPerKey {
		l.mu.Unlock()
		return nil, false
	}
	l.active[key] = cur + 1
	l.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			l.mu.Lock()
			if n := l.active[key]; n <= 1 {
				delete(l.active, key)
			} else {
				l.active[key] = n - 1
			}
			l.mu.Unlock()
		})
	}, true
}
