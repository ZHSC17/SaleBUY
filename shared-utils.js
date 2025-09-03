// shared-utils.js

/**
 * 获取 VWAP 中间价格
 * @param {'BUY' | 'SELL'} direction 
 * @param {number} tradeDecimal 小数精度
 * @returns {Promise<string|null>}
 */
const quoteAsset = "USDT";
const timeoutMs = 5000;
const pollInterval = 500;

let totalSale = 0;
let isCircle = false;
let orderid = 0;
let sellquantity = 1000000;
let clearLock = false;

var MYcoinName;
var nowTradeNumberPanel;

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
    const rounded = Number(parseFloat(num).toFixed(window.tradeDecimal));
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
        zIndex: 99998,
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
                    headers: window.capturedHeaders,
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
            symbol:window.symbol
        };
        // 给 fetch 加超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 5 秒超时
        const res = await fetch('https://www.binance.com/bapi/defi/v1/private/alpha-trade/order/cancel', {
            method: 'POST',
            headers:window.capturedHeaders,
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
        let buyAmount = window.MY_roundTo2AndTrimZeros((buyPrice * count).toFixed(window.tradeDecimal + 5) , window.tradeDecimal);
        await window.MY_placeOrder({
            baseAsset: window.baseAsset,
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
        baseAsset: window.baseAsset,
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

async function StopTradingCycle() {
    playBase64();
    isCircle = false;
    window.MY_logToPanel(`已结束交易`);
}

async function ClearTradeData() {
    localStorage.setItem('saleValue'+ MYcoinName, 0);
    playBase64();
    window.MY_logToPanel(`已清理历史交易数据`);
}

  // 轮询监听成交状态
async function GetOrderHistory(orderid) {
    let count = 0;
    while(true && isCircle)
    {
        try {
            const endTime = Date.now();
            const startTime = endTime - 60 * 60 * 1000; // 前一小时
            const url = `https://www.binance.com/bapi/defi/v1/private/alpha-trade/order/get-order-history-web?page=1&rows=10&orderStatus=FILLED,PARTIALLY_FILLED,EXPIRED,CANCELED,REJECTED&startTime=${startTime}&endTime=${endTime}`;

            // 给 fetch 加超时
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 5 秒超时

            const res = await fetch(
                url,
                {
                    method: 'GET',
                    headers: window.capturedHeaders,
                    credentials: 'include',
                    signal: controller.signal
                }
            );
            clearTimeout(timeoutId);

            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                const targetOrder = json.data.find(order => order.orderId === orderid || order.orderId === String(orderid));
                if (targetOrder) {
                    return targetOrder;
                } else {
                    return null;
                }
            } else {
                if(count >= 3)
                {
                    playBase64();
                }
                window.MY_logToPanel("❌ 查询订单失败: " + json.message );
            }
        } catch (err) {
            if(count >= 3)
            {
                playBase64();
            }
            window.MY_logToPanel("⚠️ 请求查询订单异常: " + err.message);
        }
        count++;
        await new Promise(r => setTimeout(r, pollInterval));

    }

}

async function waitUntilFilled(keyword,index,price) {
    const start = Date.now();
    while (true && isCircle) {
        try{
            window.MY_logToPanel(`第 ${index} 轮交易当前状态消息 价格${price} 等待成交`, );
            let orderState = await GetOrderHistory(orderid);
            if(orderState != null && orderState.status == "FILLED")
            {
                if(orderState.origQty == orderState.executedQty)
                {
                    window.MY_logToPanel(`第 ${index} 轮交易🎯 检测到成交: ` + keyword);
                    let result = {
                        state : true
                    }
                    return result;
                }
            }
            await new Promise(r => setTimeout(r, pollInterval));
            if(Date.now() - start > timeoutMs)
            {
                const cancelResult = await window.MY_CancelOrder();
                if(isCircle)
                {
                    if(cancelResult)
                    {
                        while(true)
                        {
                            let orderState = await GetOrderHistory(orderid);
                            if(orderState != null && orderState.status == "CANCELED")
                            {
                                let result = {
                                    state : false,
                                    executedQty :orderState.executedQty
                                }
                                return result
                            }
                        }
                    }
                }
                else
                {
                    let result = {
                        state : true
                    }
                    return result;
                }
            }
        }
        catch (err) {
            window.MY_logToPanel("⚠️ 请求异常: " + err.message);
        }
    }
    let result = {
        state : true
    }
    return result;
}

    // 循环交易主逻辑
async function startTradingCycle(times = 10) {
    if(window.tradeDecimal == -1) return;
    if (clearLock) return; // 已经处理过了，忽略后续点击
    clearLock = true;
    window.MY_logToPanel(`开始交易`);
    setTimeout(() => {
        clearLock = false;
    }, 1000);
    
    localStorage.setItem('totalTradeAmount'+ MYcoinName, totalInput.value);
    window.MY_MaxTradeNumber = parseInt(localStorage.setItem('totalTradeAmount'+ MYcoinName) || 500);
    
    sellquantity = window.MY_roundTo2AndTrimZeros(window.MY_PerTradeNumber * 0.9999 , 2);
    if (!window.headerReady) {
        alert("⚠️ 请先手动点击历史委托（在网页里）， 才能捕获验证信息");
        window.MY_logToPanel("⚠️ 请先手动点击历史委托（在网页里）， 才能捕获验证信息");
        return;
    }
    totalSale = parseFloat(localStorage.getItem('saleValue'+ MYcoinName) || '0');
    if(totalSale > window.MY_MaxTradeNumber)
    {
        playBase64();
        alert(`🎉 已完成交易 总交易额 ${totalSale}`);
        return;
    }
    isCircle = true;
    let i = 1
    for (; i <= 100000; i++) {
        window.MY_logToPanel(`\n=== 第 ${i} 轮交易开始 ===`);
        let buyPrice = await window.MY_BuyOrderCreate(window.MY_PerTradeNumber);
        let result = await waitUntilFilled("Alpha限价买单已成交" , i ,buyPrice)
        let myquantity = window.MY_PerTradeNumber
        while(!result.state)
        {
            await new Promise(r => setTimeout(r, pollInterval));
            const executedQty = parseFloat(result.executedQty);
            myquantity = window.MY_roundTo6AndTrimZeros(myquantity - executedQty);
            buyPrice = await window.MY_BuyOrderCreate(myquantity);
            result = await waitUntilFilled("Alpha限价买单已成交" , i ,buyPrice)
        }

        totalSale += buyPrice * window.MY_PerTradeNumber;

        if(!isCircle){
            window.MY_logToPanel(`停止自动交易`);
            break;
        }

        let sellPrice = await window.MY_SellOrderCreate(sellquantity);
        result = await waitUntilFilled("Alpha限价卖单已成交" , i ,sellPrice)
        myquantity = sellquantity
        while(!result.state)
        {
            await new Promise(r => setTimeout(r, pollInterval));
            const executedQty = parseFloat(result.executedQty);
            myquantity = window.MY_roundTo6AndTrimZeros(myquantity - executedQty);
            sellPrice = await window.MY_SellOrderCreate(myquantity);
            result = await waitUntilFilled("Alpha限价卖单已成交" , i ,sellPrice)
        }

        if(!isCircle){
            window.MY_logToPanel(`停止自动交易`);
            break;
        }
        window.MY_logToPanel(`✅ 第 ${i} 轮交易完成 现在总交易额${totalSale}`);
        localStorage.setItem('saleValue'+ MYcoinName , totalSale);
        nowTradeNumberPanel.textContent = "当前交易金额:" + totalSale;
        if(totalSale > window.MY_MaxTradeNumber)
        {
            playBase64();
            window.MY_logToPanel(`已完成交易 ${i} 次自动交易 总交易额 ${totalSale}`);
            await new Promise(r => setTimeout(r, 2000));
            alert(`🎉 已完成交易 总交易额 ${totalSale}`);
            return;
        }
    }
    isCircle = false;
    playBase64();
    window.MY_logToPanel(`已完成交易 ${i} 次自动交易 总交易额 ${totalSale}`);
    await new Promise(r => setTimeout(r, 2000));
    alert(`🎉 已完成交易 ${i} 次自动交易 总交易额 ${totalSale}`);
}
   

function CreateUI() {
    MYcoinName = window.coinName

    nowTradeNumberPanel = document.createElement('nowTradeNumber');
    nowTradeNumberPanel.textContent = "当前交易金额:" + (localStorage.getItem('saleValue' + MYcoinName) || 0);
    nowTradeNumberPanel.style.position = 'fixed';
    nowTradeNumberPanel.style.bottom = '210px';
    nowTradeNumberPanel.style.right = '20px';
    nowTradeNumberPanel.style.zIndex = 9999;
    nowTradeNumberPanel.style.color = 'white';
    nowTradeNumberPanel.style.backgroundColor = "green";
    document.body.appendChild(nowTradeNumberPanel);

    const totalLabel = document.createElement('label');
    totalLabel.textContent = "总交易金额:";
    totalLabel.style.position = 'fixed';
    totalLabel.style.bottom = '180px';
    totalLabel.style.right = '20px';
    totalLabel.style.zIndex = 9999;
    totalLabel.style.color = 'white';
    totalLabel.style.backgroundColor = "green";

    const totalInput = document.createElement('input');
    totalInput.type = 'number';
    totalInput.value = localStorage.getItem('totalTradeAmount' + MYcoinName) || 65536; // 默认值
    totalInput.style.width = '100px';
    totalInput.style.marginLeft = '5px';
    totalInput.style.backgroundColor = "white";
    totalInput.onchange = () => {
        localStorage.setItem('totalTradeAmount'+ MYcoinName, totalInput.value);
        window.MY_MaxTradeNumber = totalInput.value
    };
    totalLabel.appendChild(totalInput);
    document.body.appendChild(totalLabel);

    // ====== 输入框：单次买入数量 ======
    const qtyLabel = document.createElement('label');
    qtyLabel.textContent = "单次买入数量:";
    qtyLabel.style.position = 'fixed';
    qtyLabel.style.bottom = '150px';
    qtyLabel.style.right = '20px';
    qtyLabel.style.zIndex = 9999;
    qtyLabel.style.color = 'white';
    qtyLabel.style.backgroundColor = "green";

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.value = localStorage.getItem('singleBuyQty'+ MYcoinName) || 500; // 默认值
    qtyInput.style.width = '100px';
    qtyInput.style.marginLeft = '5px';
    qtyInput.style.backgroundColor = "white";
    qtyInput.onchange = () => {
        localStorage.setItem('singleBuyQty'+ MYcoinName, qtyInput.value);
        window.MY_PerTradeNumber = totalInput.value
    };
    qtyLabel.appendChild(qtyInput);
    document.body.appendChild(qtyLabel);


      // UI按钮
    const btn = document.createElement('button');
    btn.textContent = '🚀 开始' + MYcoinName + '自动交易';
    btn.style.position = 'fixed';
    btn.style.bottom = '60px';
    btn.style.right = '20px';
    btn.style.zIndex = 9999;
    btn.style.padding = '10px';
    btn.style.backgroundColor = '#f0b90b';
    btn.style.border = 'none';
    btn.style.color = 'Green';
    btn.style.fontWeight = 'bold';
    btn.style.borderRadius = '8px';
    btn.onclick = () => startTradingCycle();
    
    const cancelbtn = document.createElement('button');
    cancelbtn.textContent = '结束交易';
    cancelbtn.style.position = 'fixed';
    cancelbtn.style.bottom = '100px';
    cancelbtn.style.right = '20px';
    cancelbtn.style.zIndex = 9999;
    cancelbtn.style.padding = '10px';
    cancelbtn.style.backgroundColor = '#f0b90b';
    cancelbtn.style.border = 'none';
    cancelbtn.style.color = 'black';
    cancelbtn.style.fontWeight = 'bold';
    cancelbtn.style.borderRadius = '8px';
    cancelbtn.onclick = () => StopTradingCycle();


    const clearbtn = document.createElement('button');
    clearbtn.textContent = '清理交易数据';
    clearbtn.style.position = 'fixed';
    clearbtn.style.bottom = '20px';
    clearbtn.style.right = '20px';
    clearbtn.style.zIndex = 9999;
    clearbtn.style.padding = '10px';
    clearbtn.style.backgroundColor = '#f0b90b';
    clearbtn.style.border = 'none';
    clearbtn.style.color = 'black';
    clearbtn.style.fontWeight = 'bold';
    clearbtn.style.borderRadius = '8px';
    clearbtn.onclick = () => ClearTradeData();

    document.body.appendChild(btn);
    document.body.appendChild(cancelbtn);
    document.body.appendChild(clearbtn);
    
    logToPanel("UI创建完成")
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
window.MY_CreateUI = CreateUI;

console.log("🚀 加载成功");
