const config = {
    // /////////////// [ بيانات الاتصال بـ API و البوت ] ///////////////
    BOT_TOKEN: '8298646432:AAEQeDEDzu-XSKVd8cCYSU6VA-ano9jfyOQ', // توكن البوت
    CLIENT_KEY: '208a6308e5f8f9db08c2f528767f0312139', // مفتاح العميل الخاص بموقع Hotmail007 API
    API_HOST: 'https://api.hotmail007.com',
    
    // /////////////// [ بيانات المسؤول ] ///////////////
    ADMIN_ID: 1446874561, // المعرف الخاص بك
    RETRY_DELAY_MS: 10000, 

    // /////////////// [ بيانات قاعدة البيانات (الآن أصبحت كاملة) ] ///////////////
    MONGO_URI: 'mongodb+srv://faresgam14b_db_user:FAres0159357@cluster0.0lbn8fr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
    MONGO_DB_NAME: 'TelegramBotDB', // اسم قاعدة البيانات داخل الـ Cluster
};

module.exports = config;