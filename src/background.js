'use strict'

import { get, getMinimumFontSize, insertCSS, executeScript, getFontList, getAllFrames } from './utils'

const FontAlias = {
  '宋体': 'SimSun'
, '黑体': 'SimHei'
, '微软雅黑': 'Microsoft YaHei'
, '微软正黑体': 'Microsoft JhengHei'
, '新宋体': 'NSimSun'
, '细明体': 'MingLiU'
, '标楷体': 'DFKai-SB'
, '仿宋': 'FangSong'
, '楷体': 'KaiTi'
, '仿宋_GB2312': 'FangSong_GB2312'
, '楷体_GB2312': 'KaiTi_GB2312'
, '华文细黑': 'STHeiti Light [STXihei]'
, '华文黑体': 'STHeiti'
, '华文楷体': 'STKaiti'
, '华文宋体': 'STSong'
, '华文仿宋': 'STFangsong'
, '丽黑 Pro': 'LiHei Pro Medium'
, '丽宋 Pro': 'LiSong Pro Light'
, '标楷体': 'BiauKai'
, '苹果丽中黑': 'Apple LiGothic Medium'
, '苹果丽细宋': 'Apple LiSung Light'
}

chrome.runtime.onInstalled.addListener(async () => {
  const storage = await get(null) || {}
  const config = storage.config || {}
  if (typeof config['standard'] === 'undefined'
  || typeof config['fixed_width'] === 'undefined') {
    chrome.tabs.create({ 'url': 'chrome://extensions/?options=' + chrome.runtime.id })
  }
})

;(async () => {
  function* generateFallback(font) {
    font = font.split(' ').slice(0, -1)
    while (font.length > 0) {
      yield font.join(' ')
      font = font.slice(0, -1)
    }
  }

  function createFontStyle({ standard_fonts = [], monospace_fonts = [], default_fonts = [] }, config = {}) {
    if (Object.keys(config).length === 0) {
      config = { 'standard': 'Serif', 'fixed_width': 'Monospace' }
    }

    function createFontFaceDirective(family, ...fonts) {
      fonts = fonts.map(font => `local(${ font })`).join(', ')
      return `@font-face { font-family: ${ family }; src: ${ fonts }; }\n`
    }

    function createFontFaceDirectives(font) {
      let result = ''

      if (default_fonts.includes(font)) {
        result += createFontFaceDirective(font, config['standard'], ...generateFallback(config['standard']), config['fixed_width'], ...generateFallback(config['fixed_width']))
      } else if (monospace_fonts.includes(font)) {
        result += createFontFaceDirective(font, config['fixed_width'], ...generateFallback(config['fixed_width']), config['standard'], ...generateFallback(config['standard']))
      } else {
        result += createFontFaceDirective(font, config['standard'], ...generateFallback(config['standard']), config['fixed_width'], ...generateFallback(config['fixed_width']))
      }

      if (FontAlias[font]) {
        if (default_fonts.includes(font)) {
          result += createFontFaceDirective(FontAlias[font], config['standard'], ...generateFallback(config['standard']), config['fixed_width'], ...generateFallback(config['fixed_width']))
        } else if (monospace_fonts.includes(font)) {
          result += createFontFaceDirective(FontAlias[font], config['fixed_width'], ...generateFallback(config['fixed_width']), config['standard'], ...generateFallback(config['standard']))
        } else {
          result += createFontFaceDirective(FontAlias[font], config['standard'], ...generateFallback(config['standard']), config['fixed_width'], ...generateFallback(config['fixed_width']))
        }
      }

      return result
    }

    return standard_fonts.reduce((result, font) => {
      if (font !== config['standard'] && FontAlias[font] !== config['standard']
      && font !== config['fixed_width'] && FontAlias[font] !== config['fixed_width']) {
        result += createFontFaceDirectives(font)
      }

      return result
    }, '')
  }

  function createFontString(config = {}) {
    if (Object.keys(config).length === 0) {
      config = { 'standard': 'Serif', 'fixed_width': 'Monospace' }
    }

    let fonts = [config['standard'], ...generateFallback(config['standard']), config['fixed_width'], ...generateFallback(config['fixed_width'])]
    return fonts.join(', ')
  }

  function createBodyStyle(config = {}) {
    if (Object.keys(config).length === 0) {
      config = { 'standard': 'Serif', 'fixed_width': 'Monospace' }
    }

    return `body { font-family: ${ createFontString(config) }; }`
  }

  let storage = await get(null) || {}
  let fontList = storage.fontList || {}
  let config = storage.config || {}
  let fontStyle = createFontStyle(fontList, config)
  let fontString = createFontString(config)
  let bodyStyle = createBodyStyle(config)
  console.log(fontStyle)
  console.log(bodyStyle)

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local') {
      storage = await get(null) || {}
      fontList = storage.fontList || {}
      config = storage.config || {}
      fontStyle = createFontStyle(fontList, config)
      fontString = createFontString(config)
      console.log(fontStyle)
      console.log(bodyStyle)
    }
  })

  async function inject(tabId, frameId = 0) {
    return await Promise.all([
      // It could be overridden by page style, but efficient.
      insertCSS(tabId, {
        code: fontStyle + bodyStyle
      , runAt: 'document_start'
      , allFrames: true // Cannot work.
      , frameId
      , matchAboutBlank: true
      })
    , // The high priority patch, may be offending the user.
      executeScript(tabId, {
        code: `
          document.addEventListener('DOMContentLoaded', () => {
            document.body.style.fontFamily = ${ JSON.stringify(fontString) }
            // Tauqeer RTL Modification 
              document.body.style.direction = "rtl";
          })
        `
      , runAt: 'document_start'
      , allFrames: true // Cannot work.
      , frameId
      , matchAboutBlank: true
      })
    ])
  }

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    switch (changeInfo.status) {
      case 'loading': await inject(tabId)
      case 'complete': (await getAllFrames({ tabId }) || [])
        .filter(x => x.frameId !== 0) // Not the top-level frame.
        .forEach(x => inject(tabId, x.frameId))
      default: console.log(new Date(), tabId, changeInfo, tab)
    }
  })
})()
