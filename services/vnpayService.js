const crypto = require('crypto');

class VNPayService {
    constructor() {
        this.tmnCode = process.env.VNP_TMN_CODE || 'XO4STLLN';
        this.secretKey = process.env.VNP_HASH_SECRET || 'IB35Y4KGVDKFGNGVEI1U6XTSA7SV6KR4';
        this.vnpUrl = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
        this.returnUrl = process.env.VNP_RETURN_URL || 'https://afterglow-cosmetic-backend.onrender.com/api/payment/vnpay/return';
        this.usdToVndRate = 25000; // Standard exchange rate for Afterglow Luxury
    }

    createPaymentUrl(params) {
        let { amount, orderId, orderInfo, ipAddress } = params;
        
        // Convert USD to VND
        const amountVnd = Math.round(amount * this.usdToVndRate);
        
        const date = new Date();
        const createDate = this.formatDate(date);
        
        let vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.1.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = this.tmnCode;
        vnp_Params['vnp_Locale'] = 'vn';
        vnp_Params['vnp_CurrCode'] = 'VND';
        vnp_Params['vnp_TxnRef'] = orderId;
        vnp_Params['vnp_OrderInfo'] = orderInfo;
        vnp_Params['vnp_OrderType'] = 'other';
        vnp_Params['vnp_Amount'] = amountVnd * 100;
        vnp_Params['vnp_ReturnUrl'] = this.returnUrl;
        vnp_Params['vnp_IpAddr'] = ipAddress;
        vnp_Params['vnp_CreateDate'] = createDate;

        vnp_Params = this.sortObject(vnp_Params);

        // Build signData with encoded values, replacing %20 with +
        const signData = Object.keys(vnp_Params)
            .map(key => {
                const val = String(vnp_Params[key]);
                return `${encodeURIComponent(key)}=${encodeURIComponent(val).replace(/%20/g, "+")}`;
            })
            .join('&');

        const hmac = crypto.createHmac("sha512", this.secretKey);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
        
        // Build final payment URL
        const paymentUrl = new URL(this.vnpUrl);
        Object.keys(vnp_Params).forEach(key => {
            paymentUrl.searchParams.append(key, vnp_Params[key]);
        });
        paymentUrl.searchParams.append('vnp_SecureHash', signed);
        
        // IMPORTANT: URLSearchParams.toString() might use %20. 
        // VNPAY often requires + for hashing but might accept %20 in URL.
        // However, to be safe, we reconstruct the URL manually to match signData.
        
        const finalUrl = this.vnpUrl + '?' + signData + '&vnp_SecureHash=' + signed;
        return finalUrl;
    }

    verifyResponse(vnp_Params) {
        const secureHash = vnp_Params['vnp_SecureHash'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        const sortedParams = this.sortObject(vnp_Params);
        
        const signData = Object.keys(sortedParams)
            .map(key => {
                const val = String(sortedParams[key]);
                return `${encodeURIComponent(key)}=${encodeURIComponent(val).replace(/%20/g, "+")}`;
            })
            .join('&');
        
        const hmac = crypto.createHmac("sha512", this.secretKey);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

        return secureHash === signed;
    }

    sortObject(obj) {
        let sorted = {};
        let keys = Object.keys(obj).sort();
        for (let key of keys) {
            sorted[key] = obj[key];
        }
        return sorted;
    }

    formatDate(date) {
        // Force GMT+7 (Vietnam Time)
        const vnTime = new Date(date.getTime() + (7 * 60 * 60 * 1000));
        const pad = (n) => (n < 10 ? '0' + n : n);
        return vnTime.getUTCFullYear() +
            pad(vnTime.getUTCMonth() + 1) +
            pad(vnTime.getUTCDate()) +
            pad(vnTime.getUTCHours()) +
            pad(vnTime.getUTCMinutes()) +
            pad(vnTime.getUTCSeconds());
    }
}

module.exports = new VNPayService();
