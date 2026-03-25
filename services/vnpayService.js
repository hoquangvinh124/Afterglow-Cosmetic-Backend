const crypto = require('crypto');

class VNPayService {
    constructor() {
        this.tmnCode = process.env.VNP_TMN_CODE || 'QLXYGQR9';
        this.secretKey = process.env.VNP_HASH_SECRET || 'B3XNGSJCRN4B5MAETH7FXKNPGRG4WR7F';
        this.vnpUrl = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
        this.returnUrl = process.env.VNP_RETURN_URL || 'http://localhost:5000/api/payment/vnpay/return';
    }

    createPaymentUrl(params) {
        const { amount, orderId, orderInfo, ipAddress } = params;
        
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
        vnp_Params['vnp_Amount'] = amount * 100;
        vnp_Params['vnp_ReturnUrl'] = this.returnUrl;
        vnp_Params['vnp_IpAddr'] = ipAddress;
        vnp_Params['vnp_CreateDate'] = createDate;

        vnp_Params = this.sortObject(vnp_Params);

        const signData = Object.keys(vnp_Params)
            .map(key => `${key}=${vnp_Params[key]}`)
            .join('&');

        const hmac = crypto.createHmac("sha512", this.secretKey);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
        
        vnp_Params['vnp_SecureHash'] = signed;
        
        const searchParams = new URLSearchParams();
        for (const key in vnp_Params) {
            searchParams.append(key, vnp_Params[key]);
        }
        
        return this.vnpUrl + '?' + searchParams.toString();
    }

    verifyResponse(vnp_Params) {
        const secureHash = vnp_Params['vnp_SecureHash'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        const sortedParams = this.sortObject(vnp_Params);
        const signData = Object.keys(sortedParams)
            .map(key => `${key}=${sortedParams[key]}`)
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
        const pad = (n) => (n < 10 ? '0' + n : n);
        return date.getFullYear() +
            pad(date.getMonth() + 1) +
            pad(date.getDate()) +
            pad(date.getHours()) +
            pad(date.getMinutes()) +
            pad(date.getSeconds());
    }
}

module.exports = new VNPayService();
