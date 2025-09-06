// shared-utils.js

/**
 * 获取 VWAP 中间价格
 * @param {'BUY' | 'SELL'} direction
 * @param {number} tradeDecimal 小数精度
 * @returns {Promise<string|null>}
 */
const quoteAsset = "USDT";
const pollInterval = 500;

let totalBuy = 0;
let totalSale = 0;
let isCircle = false;
let orderid = 0;
let sellquantity = 1000000;
let clearLock = false;
let tradeHistory = [];

var MYcoinName;
var nowTradeNumberPanel;
var nowTradeSaleNumber;
var tradeTypeDropdown;

let tradeNodes = [];

function InitTradeNodes() {
    // 只执行一次，用于缓存节点引用
    tradeNodes = Array.from(
        document.querySelectorAll('.ReactVirtualized__Grid__innerScrollContainer > div[role="gridcell"]')
    );
}

function UpdateTradeHistoryData() {
    if (tradeNodes.length === 0) {
        InitTradeNodes();
    }

    const newData = tradeNodes.slice().reverse().map(div => {
        const timeText   = div.children[0]?.textContent || ''; // 时间
        const priceText  = div.children[1]?.textContent || ''; // 价格
        const volumeText = div.children[2]?.textContent || ''; // 数量

        const price  = parseFloat(priceText.replace(/,/g, ''));
        const volume = parseFloat(volumeText.replace(/,/g, ''));

        // 主动方（根据颜色判断）
        const colorStyle = div.children[1]?.getAttribute('style') || '';
        let side = '';
        if (colorStyle.includes('Buy')) side = 'BUY';
        else if (colorStyle.includes('Sell')) side = 'SELL';

        return (isNaN(price) || isNaN(volume) || !timeText)
            ? null
            : { time: timeText, price, volume, side };
    }).filter(item => item !== null);

    for (const trade of newData) {
        const exists = tradeHistory.some(
            t => t.time === trade.time && t.price === trade.price && t.volume === trade.volume && t.side === trade.side
        );
        if (!exists) {
            tradeHistory.push(trade);
        }
    }

    if (tradeHistory.length > 300) {
        tradeHistory = tradeHistory.slice(-300);
    }
}

function WebViewIsNormal()
{
     if (tradeHistory.length > 0) {
        const latestTrade = tradeHistory[tradeHistory.length - 1];

        // 把 HH:mm:ss 拼接到今天日期
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
        const tradeTime = new Date(`${todayStr}T${latestTrade.time}`);

        const diffSec = (now - tradeTime) / 1000;

        if (diffSec > 15) {
            return false;
        }
        else{
            return true;
        }
    }
    return false;
}

function timeToSeconds(timeStr) {
    // 格式: "HH:MM:SS"
    const [h, m, s] = timeStr.split(":").map(Number);
    return h * 3600 + m * 60 + s;
}

function isDowntrend(tradeHistory, N = 10, ratioThreshold = 0.65, streakThreshold = 5) {
    const recent = tradeHistory.slice(-N);
    if (recent.length === 0) return false;

    // 计算 SELL 成交量占比
    let sellVolume = 0, totalVolume = 0;
    for (const d of recent) {
        totalVolume += d.volume;
        if (d.side === 'SELL') {
            sellVolume += d.volume;
        }
    }
    const sellRatio = totalVolume > 0 ? sellVolume / totalVolume : 0;

    // 检查连续卖单
    let streak = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
        if (recent[i].side === 'SELL') {
            streak++;
        } else {
            break;
        }
    }

    // 满足任一条件 → 判定为下跌
    if (sellRatio > ratioThreshold || streak >= streakThreshold) {
        return true;
    }
    return false;
}

//基础VWAP交易逻辑
function BasePriceByWeightedVolume(direction = 'BUY') {
    const vwap = getVWAP(tradeHistory , 5);

    if (direction === 'BUY') {
        if(isDowntrend(tradeHistory))
        {
            logToPanel("下跌趋势，禁止买入！")
            return null;
        }
        // 买入：参考 VWAP 并稍微往下压，避免吃到高价
        return (vwap * window.MY_BaseTradebuyOffsetInputNumber).toFixed(window.tradeDecimal);
    } else {
        if(isDowntrend(tradeHistory , 10 , 0.7 , 6))
        {
            logToPanel("下跌趋势，快速卖出！")
             return (vwap * 0.99).toFixed(window.tradeDecimal);
        }
        // 卖出：参考 VWAP 并稍微往上抬
        return (vwap * window.MY_BaseTradeSaleOffsetInputNumber).toFixed(window.tradeDecimal);
    }
}

//获取VWAP
function getVWAP(data, windowSize = 20) {
    const recent = data.slice(-windowSize);
    const totalVolume = recent.reduce((sum, d) => sum + d.volume, 0);
    return recent.reduce((sum, d) => sum + d.price * d.volume, 0) / totalVolume;
}

//计算斜率，无成交量
function calcSlope(data) {
    if (data.length < 2) return 0;

    const N = data.length;
    const xMean = (N - 1) / 2;
    const yMean = data.reduce((sum, d) => sum + d.price, 0) / N;

    let num = 0, den = 0;
    data.forEach((d, i) => {
        num += (i - xMean) * (d.price - yMean);
        den += (i - xMean) ** 2;
    });

    return num / den; // 斜率 a
}

//计算斜率，判断是否单边 , 有成交量
function calcSlopeWithVolume(data) {
    if (data.length < 2) return 0;

    const N = data.length;

    // x 为时间索引
    const xMean = (N - 1) / 2;

    // 计算加权平均价格（按 volume）
    const totalVolume = data.reduce((sum, d) => sum + d.volume, 0);
    const yMean = data.reduce((sum, d) => sum + d.price * d.volume, 0) / totalVolume;

    let num = 0, den = 0;

    data.forEach((d, i) => {
        const weight = d.volume;
        const x = i;
        const y = d.price;

        num += weight * (x - xMean) * (y - yMean);
        den += weight * (x - xMean) ** 2;
    });

    return num / den;
}

//归一化价格，然后计算斜率
function calcNormalizedSlopeWithVolume(data) {
    if (data.length < 2) return 0;

    const prices = data.map(d => d.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    const normalizedData = data.map(d => ({
        price: d.price / avgPrice,
        volume: d.volume
    }));

    return calcSlopeWithVolume(normalizedData);
}

//VWAP交易逻辑 过滤单边 并自动调整偏移
function BasePriceByWeightedVolume2(direction = 'BUY') {

    let data = tradeHistory.slice(-20);

    if (data.length === 0) return null;

    // 计算 VWAP
    const vwap =getVWAP(tradeHistory , 20);

    // 计算斜率
    const slope = calcNormalizedSlopeWithVolume(data);

    // 动态调整因子
    let buyOffset = window.MY_BaseTradebuyOffsetInputNumber;
    let sellOffset = window.MY_BaseTradeSaleOffsetInputNumber;

    const maxSlopeImpact = 0.005;
    const slopeFactor = Math.max(-maxSlopeImpact, Math.min(maxSlopeImpact, slope));

    buyOffset *= 1 + slopeFactor;
    sellOffset *= 1 + slopeFactor * 1.5;

    if (slope > 0) {
        // 上升趋势：买价抬高一些，卖价更乐观
        buyOffset *= 1.001;
        sellOffset *= 1.002;
    } else if (slope < 0) {
        // 下跌趋势：买价更保守，卖价收缩
        buyOffset *= 0.999;
        sellOffset *= 0.998;
    }

    if (direction === 'BUY') {
        return (vwap * buyOffset).toFixed(window.tradeDecimal);
    } else {
        return (vwap * sellOffset).toFixed(window.tradeDecimal);
    }
}

function BasePriceByWeightedVolume3(direction = 'BUY') {

    let data = tradeHistory.slice(-20);
    if (data.length < 2) return null;

    const N = data.length;
    const slope = calcSlope(data); // a




    // 计算回归线截距 b
    const xMean = (N - 1) / 2;
    const yMean = data.reduce((sum, d) => sum + d.price, 0) / N;
    const intercept = yMean - slope * xMean;

    let stepsAhead = Math.min(5, Math.max(2, Math.floor(Math.abs(slope * 100000))));
    if(slope < -0.0001)
    {
        if( direction === 'BUY')
            return 0;
        else
            stepsAhead = 5;
    }
    else
        stepsAhead = 2;

    const futureX = N - 1 + stepsAhead;
    window.MY_TradWaitTime = stepsAhead  + 1;
    const predictedPrice = slope * futureX + intercept;


    let buyOffset = window.MY_BaseTradebuyOffsetInputNumber;
    let sellOffset = window.MY_BaseTradeSaleOffsetInputNumber;

    if (direction === 'BUY') {
        return parseFloat((predictedPrice * buyOffset).toFixed(window.tradeDecimal));
    } else {
        return parseFloat((predictedPrice * sellOffset).toFixed(window.tradeDecimal));
    }
}





function getBestPriceByWeightedVolume(direction = 'BUY') {

    const selectedValue = tradeTypeDropdown.value;

    if(selectedValue == "基础低波动策略")
    {
        return BasePriceByWeightedVolume(direction);
    }
    if(selectedValue == "自动偏移调整策略")
    {
        return BasePriceByWeightedVolume2(direction);
    }
    if(selectedValue == "趋势预测策略")
    {
        return BasePriceByWeightedVolume3(direction);
    }
}

function roundTo6AndTrimZeros(num) {
    // 四舍五入到 6 位小数
    const rounded = Number(parseFloat(num).toFixed(window.tradeDecimal));
    return rounded;
}

function roundTo2AndTrimZeros(num , count , needFixed = false) {
    let str = String(num);
    const dotIndex = str.indexOf('.');
    if (dotIndex === -1) return num; //
    if(str.length - dotIndex - 1 < count)
        return num;
    if(needFixed)
    {
        const fixedNum = num.toFixed(count + 5)
        str = String(fixedNum);
    }
    return Number(str.slice(0, dotIndex + count + 1)); // 截取小数点后N位
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
    while(isCircle)
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
                    window.playBase64();
                }
                window.MY_logToPanel("❌ 下单失败: " + json.message + JSON.stringify(payload));
            }
        } catch (err) {
            if(count >= 3)
            {
                window.playBase64();
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
                window.playBase64();
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
    UpdateTradeHistoryData();
    if(!WebViewIsNormal)
    {
        window.playBase64();
        window.MY_logToPanel(`交易数据错误！请检查！`);
        return null;
    }
    let buyPrice = await window.MY_getBestPriceByWeightedVolume("BUY");
    if(buyPrice == null)
        return null;

    let buyAmount = roundTo2AndTrimZeros(buyPrice * count, window.tradeDecimal , true);
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
    UpdateTradeHistoryData();
    if(!WebViewIsNormal)
    {
        window.playBase64();
        window.MY_logToPanel(`交易数据错误！请检查！`);
        return null;
    }
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
    window.playBase64();
    isCircle = false;
    window.MY_logToPanel(`已结束交易`);
}

async function ClearTradeData() {
    localStorage.setItem('totalBuyValue'+ MYcoinName, 0);
    localStorage.setItem('totalSaleValue'+ MYcoinName, 0);
    nowTradeNumberPanel.textContent = "当前交易金额:" + 0;
    nowTradeSaleNumber.textContent = "当前亏损:" + 0;
    totalBuy = 0;
    totalSale = 0;
    window.playBase64();
    window.MY_logToPanel(`已清理历史交易数据`);
}

  // 轮询监听成交状态
async function GetOrderHistory(orderid) {
    let count = 0;
    while(isCircle)
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
                    window.playBase64();
                }
                window.MY_logToPanel("❌ 查询订单失败: " + json.message );
            }
        } catch (err) {
            if(count >= 3)
            {
                window.playBase64();
            }
            window.MY_logToPanel("⚠️ 请求查询订单异常: " + err.message);
        }
        count++;
        await new Promise(r => setTimeout(r, pollInterval));

    }

}

async function waitUntilFilled(keyword,index,price) {
    const start = Date.now();
    while (isCircle) {
        try{
            let orderState = await GetOrderHistory(orderid);
            if(orderState != null && orderState.status == "FILLED")
            {
                if(orderState.origQty == orderState.executedQty)
                {
                    window.MY_logToPanel(`第 ${index} 轮交易🎯 检测到成交: ` + keyword);
                    let result = {
                        state : true,
                        executedQty :orderState.executedQty,
                        cumQuote :orderState.cumQuote
                    }
                    return result;
                }
            }
            await new Promise(r => setTimeout(r, pollInterval));
            if(Date.now() - start > window.MY_TradWaitTime * 1000)
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
                                    executedQty :orderState.executedQty,
                                    cumQuote :orderState.cumQuote
                                }
                                return result
                            }
                        }
                    }
                }
                else
                {
                    CancelOrder();
                    let result = {
                        state : null
                    }
                    return result;
                }
            }
        }
        catch (err) {
            window.MY_logToPanel("⚠️ 请求异常: " + err.message);
        }
        await new Promise(r => setTimeout(r, pollInterval));

    }
    CancelOrder();
    let result = {
        state : null
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

    window.MY_PerTradeNumber =roundTo2AndTrimZeros( parseFloat(localStorage.getItem('singleBuyQty'+ MYcoinName) || 500),2);
    window.MY_MaxTradeNumber = parseInt(localStorage.getItem('totalTradeAmount'+ MYcoinName) || 65536);

   //sellquantity = window.MY_roundTo2AndTrimZeros(window.MY_PerTradeNumber * 0.9999 , 2);

    if (!window.headerReady) {
        alert("⚠️ 请先手动点击历史委托（在网页里）， 才能捕获验证信息");
        window.MY_logToPanel("⚠️ 请先手动点击历史委托（在网页里）， 才能捕获验证信息");
        return;
    }

    isCircle = true;
    await SaleCoinFromWallet(true);  //检查之前交易是否有未卖出币
    isCircle = true;

    totalBuy = parseFloat(localStorage.getItem('totalBuyValue'+ MYcoinName) || '0');
    totalSale = parseFloat(localStorage.getItem('totalSaleValue'+ MYcoinName) || '0');

    if(totalBuy > window.MY_MaxTradeNumber)
    {
        window.playBase64();
        alert(`🎉 已完成交易 总交易额 ${totalBuy}`);
        return;
    }
    isCircle = true;
    let i = 0
    while (isCircle) {
        if(totalBuy > window.MY_MaxTradeNumber)  //交易数量达到
        {
            break;
        }
        if(tradeHistory.length < 30 && isCircle)
        {
            window.MY_logToPanel(`等待统计历史交易记录`);
            await new Promise(r => setTimeout(r, 10000));
            continue;
        }

        i++;
        window.MY_logToPanel(`\n=== 第 ${i} 轮交易开始 ===`);

        let result = await BuyCoin(i);
        if(result == null && isCircle)
        {
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        if(!isCircle){
            window.MY_logToPanel(`停止自动交易`);
            break;
        }

        sellquantity = roundTo2AndTrimZeros(result.nowTradBuyQuantity * 0.9999 , 2);
        const nowTradSaleNumber = await SaleCoin(i , sellquantity)
        if(nowTradSaleNumber == null&& isCircle)
        {
            continue;
        }

        if(!isCircle){
            window.MY_logToPanel(`停止自动交易`);
            break;
        }
        totalBuy += result.nowTradBuyNumber;
        totalSale += parseFloat(nowTradSaleNumber);

        window.MY_logToPanel(`✅ 第 ${i} 轮交易完成 现在总交易额${totalBuy}`);

        localStorage.setItem('totalBuyValue'+ MYcoinName , totalBuy);
        localStorage.setItem('totalSaleValue'+ MYcoinName , totalSale);

        nowTradeNumberPanel.textContent = "当前交易金额:" + totalBuy;
        const tradeLossNumber = totalSale - totalBuy;
        nowTradeSaleNumber.textContent = "当前亏损:" + tradeLossNumber;

        if(tradeLossNumber < -parseFloat( window.MY_MarTradeLossNumber))
        {
            window.MY_logToPanel(`当前亏损已达上限`);
            break;
        }
    }
    isCircle = false;
    window.playBase64();
    window.MY_logToPanel(`已完成交易 ${i} 次自动交易 总交易额 ${totalBuy}`);
    await new Promise(r => setTimeout(r, 2000));
}

async function BuyCoin(i) {
    let buyPrice = await window.MY_BuyOrderCreate(window.MY_PerTradeNumber);
    if(buyPrice == null)
    {
        return null;
    }
    let result = await waitUntilFilled("Alpha限价买单已成交" , i ,buyPrice)
    let myquantity = window.MY_PerTradeNumber
    let nowTradBuyNumber = 0;
    let nowTradBuyQuantity = 0;
    if(result.state != null)
    {
        nowTradBuyNumber += parseFloat(result.cumQuote);
        nowTradBuyQuantity += parseFloat(result.executedQty);
    }
    while((result.state == false || nowTradBuyNumber <= 1) && isCircle)    //只要买入在10U以上，部分成交，也直接卖出，不等待全部成交
    {
        await new Promise(r => setTimeout(r, pollInterval));
        const executedQty = parseFloat(result.executedQty);
        myquantity = window.MY_roundTo6AndTrimZeros(myquantity - executedQty);
        buyPrice = await window.MY_BuyOrderCreate(myquantity);
        if(buyPrice == null)
        {
            break;
        }
        result = await waitUntilFilled("Alpha限价买单已成交" , i ,buyPrice)
        if(result.state != null)
        {   nowTradBuyNumber += parseFloat(result.cumQuote);
            nowTradBuyQuantity += parseFloat(result.executedQty);
        }
    }
    if(nowTradBuyQuantity < 0.1)
    {
        return null;
    }
    return {
        nowTradBuyNumber,
        nowTradBuyQuantity
    }
}

async function SaleCoin(i , saleNumber) {
    let nowTradSaleNumber = 0;

    let sellPrice = await window.MY_SellOrderCreate(saleNumber);
    if(sellPrice == null) //页面卡死
    {
        return null;
    }

    let result = await waitUntilFilled("Alpha限价卖单已成交" , i ,sellPrice)
    let myquantity = saleNumber
    if(result.state != null)
    {
        nowTradSaleNumber += parseFloat(result.cumQuote);
    }
    while(result.state == false && isCircle)
    {
        await new Promise(r => setTimeout(r, pollInterval));
        const executedQty = parseFloat(result.executedQty);
        myquantity = window.MY_roundTo6AndTrimZeros(myquantity - executedQty);
        sellPrice = await window.MY_SellOrderCreate(myquantity);
        if(sellPrice == null)
        {
            return null;
        }
        result = await waitUntilFilled("Alpha限价卖单已成交" , i ,sellPrice)
        if(result.state != null)
        {
            nowTradSaleNumber += parseFloat(result.cumQuote);
        }
    }
    return (nowTradSaleNumber * 0.9999).toFixed(6);
}

async function SaleCoinFromWallet(showTip = true) {
    let nowTradSaleNumber = 0;
    const coinData = await GetAlphaRemaining();
    if(coinData == null)
    {
        if(showTip)
            logToPanel("已卖出:" + 0);
        else
            logToPanel("账户alpha信息获取失败:" + coinData);
        return 0;
    }
    const saleNumber = roundTo2AndTrimZeros(coinData.amount , 2);
    if(coinData.valuation < 0.2)
    {
        if(showTip)
            logToPanel("已卖出:" + 0);
        else
            logToPanel("账户alpha币价值小于0.1:" + coinData.valuation);
        return 0;
    }

    let sellPrice = await window.MY_SellOrderCreate(saleNumber);
    if(sellPrice == null)  //页面卡死
    {
        return null;
    }

    let result = await waitUntilFilled("Alpha限价卖单已成交" , i ,sellPrice)
    let myquantity = saleNumber
    if(result.state != null)
        nowTradSaleNumber += parseFloat(result.cumQuote);
    while(result.state == false)
    {
        await new Promise(r => setTimeout(r, pollInterval));
        const executedQty = parseFloat(result.executedQty);
        myquantity = window.MY_roundTo6AndTrimZeros(myquantity - executedQty);
        sellPrice = await window.MY_SellOrderCreate(myquantity);
        if(sellPrice == null)
        {
            return null;
        }
        result = await waitUntilFilled("Alpha限价卖单已成交" , i ,sellPrice)
        if(result.state != null)
            nowTradSaleNumber += parseFloat(result.cumQuote);
    }
    if(showTip)
    {
        logToPanel("已卖出:" + nowTradSaleNumber);
        isCircle = false;
    }

    return (nowTradSaleNumber * 0.9999).toFixed(6);
}

async function GetAlphaRemaining() {
    let count = 0;
    while(true && isCircle)
    {
        try {
            const url = `https://www.binance.com/bapi/defi/v1/private/wallet-direct/cloud-wallet/alpha`;

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
            // {
            //     "chainId": "56",
            //     "contractAddress": "0xff7d6a96ae471bbcd7713af9cb1feeb16cf56b41",
            //     "cexAsset": false,
            //     "name": "Bedrock",
            //     "symbol": "BR",
            //     "tokenId": "ALPHA_118",
            //     "free": "0.009288",
            //     "freeze": "0",
            //     "locked": "0",
            //     "withdrawing": "0",
            //     "amount": "0.009288",
            //     "valuation": "0.0006311"
            // }
            if (json.success && Array.isArray(json.data.list)) {
                const targetCoin = json.data.list.find(order => order.tokenId === window.baseAsset || order.tokenId === String(window.baseAsset));
                if (targetCoin) {
                    return targetCoin;
                } else {
                    return null;
                }
            } else {
                if(count >= 3)
                {
                    window.playBase64();
                }
                window.MY_logToPanel("❌查询拥有Alpha币失败: " + json.message );
            }
        } catch (err) {
            if(count >= 3)
            {
                window.playBase64();
            }
            window.MY_logToPanel("⚠️ 请求查询拥有Alpha币异常: " + err.message);
        }
        count++;
        await new Promise(r => setTimeout(r, pollInterval));

    }
}

async function CreateUI() {

    MYcoinName = window.coinName
    window.MY_BaseTradebuyOffsetInputNumber = localStorage.getItem('BaseTradebuyOffsetValue' + MYcoinName) || 0.99995;
    window.MY_BaseTradeSaleOffsetInputNumber = localStorage.getItem('BaseTradeSaleOffsetValue'+ MYcoinName) || 1.00005;

    window.MY_MarTradeLossNumber = localStorage.getItem('MaxTradeFaileInput' + MYcoinName) || 3;
    window.MY_TradWaitTime = localStorage.getItem('TradWaitTime' + MYcoinName) || 5;



    const TradWaitTimeLabel = document.createElement('label');
    TradWaitTimeLabel.textContent = "交易等待时间:";
    TradWaitTimeLabel.style.position = 'fixed';
    TradWaitTimeLabel.style.bottom = '50px';
    TradWaitTimeLabel.style.right = '450px';
    TradWaitTimeLabel.style.zIndex = 9999;
    TradWaitTimeLabel.style.color = 'white';
    TradWaitTimeLabel.style.backgroundColor = "green";

    const TradWaitTimeInput = document.createElement('input');
    TradWaitTimeInput.type = 'number';
    TradWaitTimeInput.value = localStorage.getItem('TradWaitTime' + MYcoinName) || 5; // 默认值
    TradWaitTimeInput.style.width = '100px';
    TradWaitTimeInput.style.marginLeft = '5px';
    TradWaitTimeInput.style.backgroundColor = "white";
    TradWaitTimeInput.onchange = () => {
        localStorage.setItem('TradWaitTime'+ MYcoinName, TradWaitTimeInput.value);
        window.MY_TradWaitTime = TradWaitTimeInput.value;
    };
    TradWaitTimeLabel.appendChild(TradWaitTimeInput);
    document.body.appendChild(TradWaitTimeLabel);


    const MaxTradeFaileNumber = document.createElement('label');
    MaxTradeFaileNumber.textContent = "最大亏损值:";
    MaxTradeFaileNumber.style.position = 'fixed';
    MaxTradeFaileNumber.style.bottom = '20px';
    MaxTradeFaileNumber.style.right = '450px';
    MaxTradeFaileNumber.style.zIndex = 9999;
    MaxTradeFaileNumber.style.color = 'white';
    MaxTradeFaileNumber.style.backgroundColor = "green";

    const MaxTradeFaileInput = document.createElement('input');
    MaxTradeFaileInput.type = 'number';
    MaxTradeFaileInput.value = localStorage.getItem('MaxTradeFaileInput' + MYcoinName) || 3; // 默认值
    MaxTradeFaileInput.style.width = '100px';
    MaxTradeFaileInput.style.marginLeft = '5px';
    MaxTradeFaileInput.style.backgroundColor = "white";
    MaxTradeFaileInput.onchange = () => {
        localStorage.setItem('MaxTradeFaileInput'+ MYcoinName, MaxTradeFaileInput.value);
        window.MY_MarTradeLossNumber = MaxTradeFaileInput.value
    };
    MaxTradeFaileNumber.appendChild(MaxTradeFaileInput);
    document.body.appendChild(MaxTradeFaileNumber);



    const BaseTradebuyOffsetLabel = document.createElement('label');
    BaseTradebuyOffsetLabel.textContent = "买入偏移值:";
    BaseTradebuyOffsetLabel.style.position = 'fixed';
    BaseTradebuyOffsetLabel.style.bottom = '70px';
    BaseTradebuyOffsetLabel.style.right = '250px';
    BaseTradebuyOffsetLabel.style.zIndex = 9999;
    BaseTradebuyOffsetLabel.style.color = 'white';
    BaseTradebuyOffsetLabel.style.backgroundColor = "green";

    const BaseTradebuyOffsetInput = document.createElement('input');
    BaseTradebuyOffsetInput.type = 'number';
    BaseTradebuyOffsetInput.value = localStorage.getItem('BaseTradebuyOffsetValue' + MYcoinName) || 0.99995; // 默认值
    BaseTradebuyOffsetInput.style.width = '100px';
    BaseTradebuyOffsetInput.style.marginLeft = '5px';
    BaseTradebuyOffsetInput.style.backgroundColor = "white";
    BaseTradebuyOffsetInput.onchange = () => {
        localStorage.setItem('BaseTradebuyOffsetValue'+ MYcoinName, BaseTradebuyOffsetInput.value);
        window.MY_BaseTradebuyOffsetInputNumber = BaseTradebuyOffsetInput.value
    };
    BaseTradebuyOffsetLabel.appendChild(BaseTradebuyOffsetInput);
    document.body.appendChild(BaseTradebuyOffsetLabel);

    // ====== 输入框：单次买入数量 ======
    const BaseTradeSaleOffsetLabel = document.createElement('label');
    BaseTradeSaleOffsetLabel.textContent = "卖出偏移值:";
    BaseTradeSaleOffsetLabel.style.position = 'fixed';
    BaseTradeSaleOffsetLabel.style.bottom = '90px';
    BaseTradeSaleOffsetLabel.style.right = '250px';
    BaseTradeSaleOffsetLabel.style.zIndex = 9999;
    BaseTradeSaleOffsetLabel.style.color = 'white';
    BaseTradeSaleOffsetLabel.style.backgroundColor = "green";

    const BaseTradeSaleOffsetInput = document.createElement('input');
    BaseTradeSaleOffsetInput.type = 'number';
    BaseTradeSaleOffsetInput.value = localStorage.getItem('BaseTradeSaleOffsetValue'+ MYcoinName) || 1.00005; // 默认值
    BaseTradeSaleOffsetInput.style.width = '100px';
    BaseTradeSaleOffsetInput.style.marginLeft = '5px';
    BaseTradeSaleOffsetInput.style.backgroundColor = "white";
    BaseTradeSaleOffsetInput.onchange = () => {
        localStorage.setItem('BaseTradeSaleOffsetValue'+ MYcoinName, BaseTradeSaleOffsetInput.value);
        window.MY_BaseTradeSaleOffsetInputNumber = BaseTradeSaleOffsetInput.value
    };
    BaseTradeSaleOffsetLabel.appendChild(BaseTradeSaleOffsetInput);
    document.body.appendChild(BaseTradeSaleOffsetLabel);

    tradeTypeDropdown = document.createElement('select');

    // 添加选项
    ['基础低波动策略', '自动偏移调整策略', '趋势预测策略'].forEach((text, index) => {
        const option = document.createElement('option');
        option.value = text;
        option.textContent = text;
        tradeTypeDropdown.appendChild(option);
    });
    tradeTypeDropdown.addEventListener('change', function(event) {
        const selectedValue = event.target.value;
        if (selectedValue == '基础低波动策略' || selectedValue == '自动偏移调整策略'|| selectedValue == '趋势预测策略') {
            BaseTradebuyOffsetLabel.style.display = 'block';
            BaseTradeSaleOffsetLabel.style.display = 'block';
        } else {
            BaseTradebuyOffsetLabel.style.display = 'none';
            BaseTradeSaleOffsetLabel.style.display = 'none';
        }
    });



     // 设置样式（可选）
    tradeTypeDropdown.style.position = 'fixed';
    tradeTypeDropdown.style.bottom = '20px';
    tradeTypeDropdown.style.right = '250px';
    tradeTypeDropdown.style.zIndex = 9999;
    tradeTypeDropdown.style.padding = '5px';
    tradeTypeDropdown.style.borderRadius = '5px';

    document.body.appendChild(tradeTypeDropdown);




    nowTradeNumberPanel = document.createElement('nowTradeNumber');
    nowTradeNumberPanel.textContent = "当前交易金额:" + (localStorage.getItem('totalBuyValue' + MYcoinName) || 0);
    nowTradeNumberPanel.style.position = 'fixed';
    nowTradeNumberPanel.style.bottom = '210px';
    nowTradeNumberPanel.style.right = '20px';
    nowTradeNumberPanel.style.zIndex = 9999;
    nowTradeNumberPanel.style.color = 'white';
    nowTradeNumberPanel.style.backgroundColor = "green";
    document.body.appendChild(nowTradeNumberPanel);

    nowTradeSaleNumber = document.createElement('nowTradeSaleNumber');
    nowTradeSaleNumber.textContent = "当前亏损:" + ((localStorage.getItem('totalSaleValue' + MYcoinName) || 0) - (localStorage.getItem('totalBuyValue' + MYcoinName) || 0));
    nowTradeSaleNumber.style.position = 'fixed';
    nowTradeSaleNumber.style.bottom = '240px';
    nowTradeSaleNumber.style.right = '20px';
    nowTradeSaleNumber.style.zIndex = 9999;
    nowTradeSaleNumber.style.color = 'white';
    nowTradeSaleNumber.style.backgroundColor = "green";
    document.body.appendChild(nowTradeSaleNumber);

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
        window.MY_PerTradeNumber = qtyInput.value
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
    btn.style.display = "none";

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

    const saleCoin = document.createElement('button');
    saleCoin.textContent = '卖出当前币';
    saleCoin.style.position = 'fixed';
    saleCoin.style.bottom = '20px';
    saleCoin.style.right = '140px';
    saleCoin.style.zIndex = 9999;
    saleCoin.style.padding = '10px';
    saleCoin.style.backgroundColor = '#f0b90b';
    saleCoin.style.border = 'none';
    saleCoin.style.color = 'black';
    saleCoin.style.fontWeight = 'bold';
    saleCoin.style.borderRadius = '8px';
    saleCoin.onclick = () => {
        isCircle = true;
        SaleCoinFromWallet(true);
                             }

    saleCoin.style.display = "none";

    document.body.appendChild(btn);
    document.body.appendChild(cancelbtn);
    document.body.appendChild(clearbtn);
    document.body.appendChild(saleCoin);

    LoopUpdateHistoryData(btn,saleCoin);

    logToPanel("UI创建完成 版本V1.0.6");

}

var isLoadHistory = false;
async function LoopUpdateHistoryData(btn,saleCoin) {
    while(true)
    {
        if(!isCircle)
        {
            UpdateTradeHistoryData();
            if(!isLoadHistory && tradeHistory.length > 30){
                isLoadHistory = true;
                btn.style.display = "block";
                saleCoin.style.display = "block";
                logToPanel("交易数据读取完成");
            }
        }
        await new Promise(r => setTimeout(r, 10000));
    }
}


// 暴露为全局函数（油猴 @require 加载时默认执行并挂载到 window），
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
