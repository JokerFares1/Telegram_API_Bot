// config.js

const config = {
    // ⚠️ إعدادات البوت والـ API (يجب التعديل)
    BOT_TOKEN: '8298646432:AAEQeDEDzu-XSKVd8cCYSU6VA-ano9jfyOQ', // مفتاح البوت من BotFather
    CLIENT_KEY: '280eb638f5854bf9bd80b2552876703f321319', // مفتاح العميل الخاص بموقع Hotmail007 API
    API_HOST: 'https://gapi.hotmail007.com',

    // ⚠️ إعدادات المسؤول (يجب التعديل)
    ADMIN_ID: 1446074961, // >>>>>> ضع رقم الـ ID الخاص بك هنا <<<<<<

    // إعدادات الانتظار:
    RETRY_DELAY_MS: 10000, 

    // 💾 إعدادات قاعدة البيانات الجديدة (لتخزين دائم)
    MONGO_URI: 'mongodb+srv://USER:PASS@clustername.xxxxx.mongodb.net/?retryWrites=true&w=majority', // >>>>> ضع رابط الاتصال الذي حصلت عليه هنا <<<<<
    MONGO_DB_NAME: 'telegramBotDB' // اسم قاعدة البيانات داخل Cluster
};

module.exports = config;