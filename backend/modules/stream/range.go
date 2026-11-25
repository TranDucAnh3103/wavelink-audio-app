package stream

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

var (
	ErrInvalidRange        = errors.New("invalid range header")
	ErrRangeNotSatisfiable = errors.New("range not satisfiable")
)

// RangeSpec holds the parsed and CDN-safe bounded byte range for upstream requests.
type RangeSpec struct {
	HasRange       bool
	IsSuffix       bool
	Start          int64
	End            int64
	UpstreamHeader string
}

// ParseAndCapRange parses an HTTP Range header (including iOS Safari's `bytes=0-1` probe)
// and caps open-ended or overly large ranges to maxChunkBytes so googlevideo CDN does not throttle.
func ParseAndCapRange(rawHeader string, totalSize, maxChunkBytes int64) (RangeSpec, error) {
	trimmed := strings.TrimSpace(rawHeader)
	if trimmed == "" {
		if maxChunkBytes > 0 && (totalSize <= 0 || totalSize > maxChunkBytes) {
			end := maxChunkBytes - 1
			if totalSize > 0 && end >= totalSize {
				end = totalSize - 1
			}
			return RangeSpec{
				HasRange:       true,
				Start:          0,
				End:            end,
				UpstreamHeader: fmt.Sprintf("bytes=0-%d", end),
			}, nil
		}
		return RangeSpec{HasRange: false}, nil
	}

	if !strings.HasPrefix(strings.ToLower(trimmed), "bytes=") {
		return RangeSpec{}, ErrInvalidRange
	}

	spec := strings.TrimSpace(trimmed[len("bytes="):])
	if idx := strings.Index(spec, ","); idx != -1 {
		spec = strings.TrimSpace(spec[:idx])
	}
	dashIdx := strings.Index(spec, "-")
	if dashIdx == -1 {
		return RangeSpec{}, ErrInvalidRange
	}

	startStr := strings.TrimSpace(spec[:dashIdx])
	endStr := strings.TrimSpace(spec[dashIdx+1:])

	// Suffix range: bytes=-500
	if startStr == "" {
		if endStr == "" {
			return RangeSpec{}, ErrInvalidRange
		}
		suffixLen, err := strconv.ParseInt(endStr, 10, 64)
		if err != nil || suffixLen <= 0 {
			return RangeSpec{}, ErrInvalidRange
		}
		if maxChunkBytes > 0 && suffixLen > maxChunkBytes {
			suffixLen = maxChunkBytes
		}
		return RangeSpec{
			HasRange:       true,
			IsSuffix:       true,
			End:            suffixLen,
			UpstreamHeader: fmt.Sprintf("bytes=-%d", suffixLen),
		}, nil
	}

	start, err := strconv.ParseInt(startStr, 10, 64)
	if err != nil || start < 0 {
		return RangeSpec{}, ErrInvalidRange
	}
	if totalSize > 0 && start >= totalSize {
		return RangeSpec{}, ErrRangeNotSatisfiable
	}

	var end int64
	if endStr == "" {
		// Open-ended: bytes=X-
		if maxChunkBytes > 0 {
			end = start + maxChunkBytes - 1
			if totalSize > 0 && end >= totalSize {
				end = totalSize - 1
			}
		} else if totalSize > 0 {
			end = totalSize - 1
		} else {
			return RangeSpec{
				HasRange:       true,
				Start:          start,
				End:            -1,
				UpstreamHeader: fmt.Sprintf("bytes=%d-", start),
			}, nil
		}
	} else {
		parsedEnd, err := strconv.ParseInt(endStr, 10, 64)
		if err != nil || parsedEnd < start {
			return RangeSpec{}, ErrInvalidRange
		}
		end = parsedEnd
		if totalSize > 0 && end >= totalSize {
			end = totalSize - 1
		}
		if maxChunkBytes > 0 && (end-start+1) > maxChunkBytes {
			end = start + maxChunkBytes - 1
		}
	}

	return RangeSpec{
		HasRange:       true,
		Start:          start,
		End:            end,
		UpstreamHeader: fmt.Sprintf("bytes=%d-%d", start, end),
	}, nil
}
