// shared-utils.js

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


//     async function getBestPriceByWeightedVolume() {
//         await new Promise(r => setTimeout(r, 1000)); // 等待 DOM 渲染

//         const rows = Array.from(document.querySelectorAll('.ReactVirtualized__Grid__innerScrollContainer > div'));

//         const priceVolumes = rows.map(div => {
//             const priceText = div.children[1]?.textContent || '';
//             const amountText = div.children[2]?.textContent || '';
//             const price = parseFloat(priceText);
//             const amount = parseFloat(amountText);
//             if (isNaN(price) || isNaN(amount)) return null;
//             return { price, volume: price * amount };
//         }).filter(Boolean);

//         if (priceVolumes.length === 0) return null;

//         // 按 volume 从大到小排序
//         const sorted = priceVolumes.sort((a, b) => b.volume - a.volume);

//         // 取前3名（或全部）
//         const top = sorted.slice(0, 3);

//         // 按价格从小到大排序 → 返回中间那一个价格
//         const priceMiddle = top.sort((a, b) => a.price - b.price)[Math.floor(top.length / 2)];

//         return priceMiddle.price;
//     }
    
function roundTo6AndTrimZeros(num) {
    // 四舍五入到 6 位小数
    const rounded = Number(parseFloat(num).toFixed(tradeDecimal));
    return rounded;
}

function roundTo2AndTrimZeros(num , count) {
    const str = String(num);
    const dotIndex = str.indexOf('.');
    if (dotIndex === -1) return num; // 没有小数点，直接返回
    return Number(str.slice(0, dotIndex + count + 1)); // 截取小数点后两位
}


var logPanel;
function createOutputPanel() {
    logPanel = document.createElement('div');
    logPanel.id = 'tm-output-panel';

    Object.assign(logPanel.style, {
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        width: '300px',
        height: '200px',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        color: '#00ff00',
        fontFamily: 'monospace',
        fontSize: '12px',
        overflowY: 'auto',
        padding: '10px',
        zIndex: 99999,
        borderRadius: '8px',
        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
        whiteSpace: 'pre-wrap'
    });

    document.body.appendChild(logPanel);
}

function logToPanel(message) {
        if (!logPanel) return;
        const timestamp = new Date().toLocaleTimeString();
        const logLine = `[${timestamp}] ${message}`;
        let lines = logPanel.textContent.split('\n');

        // 添加新行
        lines.push(logLine);

        // 最多保留100行
        if (lines.length > 50) {
            lines = lines.slice(lines.length - 50);
        }

        logPanel.textContent = lines.join('\n');
        logPanel.scrollTop = logPanel.scrollHeight; // 自动滚动到底部
}

// 发送订单请求
async function placeOrder(payload) {
    let count = 0;
    while(true && isCircle)
    {
        try {
            // 给 fetch 加超时
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 5 秒超时

            const res = await fetch(
                'https://www.binance.com/bapi/asset/v1/private/alpha-trade/order/place',
                {
                    method: 'POST',
                    headers: capturedHeaders,
                    credentials: 'include',
                    body: JSON.stringify(payload),
                    signal: controller.signal
                }
            );
            clearTimeout(timeoutId);

            const json = await res.json();

            if (json.success) {
                orderid = json.data;
                window.MY_logToPanel('[📨 下单成功] ' + orderid + JSON.stringify(json));
                return json;
            } else {
                if(count >= 3)
                {
                    playBase64();
                }
                window.MY_logToPanel("❌ 下单失败: " + json.message + JSON.stringify(payload));
            }
        } catch (err) {
            if(count >= 3)
            {
                playBase64();
            }
            window.MY_logToPanel("⚠️ placeOrder请求异常: " + err.message);
        }
        count++;
        await new Promise(r => setTimeout(r, pollInterval));
    }

}


async function CancelOrder() {
    try {
        const payLoad = {
            orderid,
            symbol
        };
        // 给 fetch 加超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 5 秒超时
        const res = await fetch('https://www.binance.com/bapi/defi/v1/private/alpha-trade/order/cancel', {
            method: 'POST',
            headers:capturedHeaders,
            credentials: 'include',
            body: JSON.stringify(payLoad),
            signal: controller.signal
        });
        const json = await res.json();

        if (json.success) {
            window.MY_logToPanel('[📨 订单长时间未成交，已取消]'+orderid + json);
            return true;
        }
        else
        {
            window.MY_logToPanel("❌ 取消订单失败，等待重新尝试: " + json.message);
            return false;
        }
    }
    catch (err) {
            if (err.name === 'AbortError') {
                playBase64();
                window.MY_logToPanel("⚠️ 请求超时，用户主动中止，未接收服务器响应");
                await new Promise(r => setTimeout(r, 2000));
            }
            else{
                window.MY_logToPanel("⚠️ Cancel请求异常: " + err.message);
            }
            return false;
        }
}

async function BuyOrderCreate(count)
{
        let buyPrice = await window.MY_getBestPriceByWeightedVolume("BUY");
        let buyAmount = window.MY_roundTo2AndTrimZeros((buyPrice * count).toFixed(tradeDecimal + 5) , tradeDecimal);
        await window.MY_placeOrder({
            baseAsset,
            quoteAsset,
            side: "BUY",
            price: buyPrice,
            quantity:count,
            paymentDetails: [
                { amount: buyAmount, paymentWalletType: "CARD" }
            ]
        });
    return buyPrice;
}
async function SellOrderCreate(count)
{
    const sellPrice = await window.MY_getBestPriceByWeightedVolume("SELL");
    await window.MY_placeOrder({
        baseAsset,
        quoteAsset,
        side: "SELL",
        price: sellPrice,
        quantity:count,
        paymentDetails: [
            { amount: count, paymentWalletType: "ALPHA" }
        ]
    });
    return sellPrice;
}


// 暴露为全局函数（油猴 @require 加载时默认执行并挂载到 window）
window.MY_getBestPriceByWeightedVolume = getBestPriceByWeightedVolume;
window.MY_roundTo6AndTrimZeros = roundTo6AndTrimZeros;
window.MY_roundTo2AndTrimZeros = roundTo2AndTrimZeros;
window.MY_createOutputPanel = createOutputPanel;
window.MY_logToPanel = logToPanel;
window.MY_placeOrder = placeOrder;
window.MY_CancelOrder = CancelOrder;
window.MY_BuyOrderCreate = BuyOrderCreate;
window.MY_SellOrderCreate = SellOrderCreate;
