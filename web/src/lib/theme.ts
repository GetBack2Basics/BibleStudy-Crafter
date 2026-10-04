export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'biblestudy_theme'
const FONT_SCALE_KEY = 'biblestudy_font_scale'

export const getStoredTheme = (): ThemeMode => {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export const getStoredFontScale = (): number => {
  const saved = localStorage.getItem(FONT_SCALE_KEY)
  const num = saved ? parseFloat(saved) : 1.0
  return isNaN(num) ? 1.0 : Math.max(0.7, Math.min(1.5, num))
}

export const applyTheme = (theme: ThemeMode) => {
  localStorage.setItem(THEME_KEY, theme)
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export const applyFontScale = (scale: number) => {
  const safeScale = Math.max(0.7, Math.min(1.5, scale))
  localStorage.setItem(FONT_SCALE_KEY, safeScale.toFixed(2))
  document.documentElement.style.setProperty('--font-scale', safeScale.toFixed(2))
}

export const initAppearance = () => {
  applyTheme(getStoredTheme())
  applyFontScale(getStoredFontScale())
}
