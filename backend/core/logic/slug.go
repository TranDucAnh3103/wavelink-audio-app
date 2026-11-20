package logic

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	hyphenRegex = regexp.MustCompile(`-+`)

	vietnameseCharMap = map[rune]rune{
		'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
		'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
		'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
		'đ': 'd',
		'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
		'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
		'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
		'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
		'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
		'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
		'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
		'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
		'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
	}
)

// RemoveVietnameseAccents chuyển đổi ký tự tiếng Việt có dấu thành không dấu
func RemoveVietnameseAccents(s string) string {
	var sb strings.Builder
	for _, r := range strings.ToLower(s) {
		// Bỏ qua combining diacritical marks (Unicode NFD)
		if r >= 0x0300 && r <= 0x036f {
			continue
		}
		if repl, ok := vietnameseCharMap[r]; ok {
			sb.WriteRune(repl)
		} else {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

// FormatSlug chuẩn hóa chuỗi thành slug không dấu, an toàn cho URL và database
func FormatSlug(input string) string {
	cleaned := strings.TrimSpace(input)
	cleaned = strings.TrimPrefix(cleaned, "#")
	cleaned = strings.TrimSpace(cleaned)
	if cleaned == "" {
		return ""
	}

	noAccents := RemoveVietnameseAccents(cleaned)

	var sb strings.Builder
	for _, r := range noAccents {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			sb.WriteRune(r)
		} else if unicode.IsSpace(r) || r == '-' || r == '_' {
			sb.WriteRune('-')
		}
	}

	result := hyphenRegex.ReplaceAllString(sb.String(), "-")
	result = strings.Trim(result, "-")
	return result
}
