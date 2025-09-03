// shared-utils.js

/**
 * 获取 VWAP 中间价格
 * @param {'BUY' | 'SELL'} direction 
 * @param {number} tradeDecimal 小数精度
 * @returns {Promise<string|null>}
 */
async function getBestPriceByWeightedVolume(direction = 'BUY', tradeDecimal = 2) {
    const rows = Array.from(
        document.querySelectorAll('.ReactVirtualized__Grid__innerScrollContainer > div[role="gridcell"]')
    );

    const data = rows.map(div => {
        const priceText = div.children[1]?.textContent || '';
        const volumeText = div.children[2]?.textContent || '';
        const price = parseFloat(priceText.replace(/,/g, ''));
        const volume = parseFloat(volumeText.replace(/,/g, ''));
        return (isNaN(price) || isNaN(volume)) ? null : { price, volume };
    }).filter(item => item !== null).slice(0, 10);

    if (data.length === 0) return null;

    const totalVolume = data.reduce((sum, d) => sum + d.volume, 0);
    const vwap = data.reduce((sum, d) => sum + d.price * d.volume, 0) / totalVolume;

    if (direction === 'BUY') {
        return (vwap * 0.99999).toFixed(tradeDecimal);
    } else {
        return (vwap * 1.00005).toFixed(tradeDecimal);
    }
}

// 暴露为全局函数（油猴 @require 加载时默认执行并挂载到 window）
window.getBestPriceByWeightedVolume = getBestPriceByWeightedVolume;
