package stream

import "sync/atomic"

// Stats tracks atomic runtime metrics for the stream proxy.
type Stats struct {
	TotalRequests    atomic.Int64
	CacheHits        atomic.Int64
	CacheMisses      atomic.Int64
	ActiveStreams    atomic.Int64
	Upstream403Count atomic.Int64
	ExtractErrors    atomic.Int64
	BytesStreamed    atomic.Int64
}

func (s *Stats) Snapshot() map[string]interface{} {
	return map[string]interface{}{
		"totalRequests":    s.TotalRequests.Load(),
		"cacheHits":        s.CacheHits.Load(),
		"cacheMisses":      s.CacheMisses.Load(),
		"activeStreams":    s.ActiveStreams.Load(),
		"upstream403Count": s.Upstream403Count.Load(),
		"extractErrors":    s.ExtractErrors.Load(),
		"bytesStreamed":    s.BytesStreamed.Load(),
	}
}
