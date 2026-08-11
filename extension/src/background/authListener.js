// src/background/authListener.js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes.scancart_user) {
    const { newValue, oldValue } = changes.scancart_user
    if (newValue && !oldValue) console.log('✅ ScanCart: User logged in', newValue.email)
    if (!newValue && oldValue) console.log('👋 ScanCart: User logged out')
  }
})
