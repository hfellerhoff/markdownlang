# main

**Input a palindrome to check:**

> input

[input](#check)

# check

- word
- reversed = ""
- i = 0
- len = word.length

[word, reversed, i, len](#reverse)

# reverse

- word
- reversed
- i
- len

## *i >= len*

[word, reversed](#compare)

---

reversed += word[len - 1 - i]

[word, reversed, i + 1, len](#reverse)

# compare

- original
- reversed

## *original == reversed*

**{original} is a palindrome!**

---

**{original} is not a palindrome.**
