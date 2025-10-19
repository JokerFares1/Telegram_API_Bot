// ====================================================================
// الكود المعدّل ليعمل كـ Serverless Function على Vercel (Webhooks)
// ====================================================================

// 1. استيراد المكتبات الضرورية
const { Telegraf, session } = require('telegraf');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const config = require('./config'); // ملف الإعدادات

// 2. تهيئة البوت وقاعدة البيانات
const bot = new Telegraf(config.BOT_TOKEN);
let db; // متغير لحفظ اتصال قاعدة البيانات

// 3. دالة الاتصال بقاعدة البيانات
async function connectDB() {
    if (db) return db; // إذا كان الاتصال موجوداً، أعده مباشرة

    try {
        const client = new MongoClient(config.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        await client.connect();
        db = client.db(config.MONGO_DB_NAME);
        console.log("✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح.");
        return db;
    } catch (error) {
        console.error("❌ فشل الاتصال بقاعدة البيانات:", error.message);
        throw error; // أعد رمي الخطأ لإظهاره في سجلات Vercel
    }
}

// 4. استخدام الجلسات (Sessions) والـ Middleware الأساسي
bot.use(session());

// 5. وظيفة جلب البيانات الأساسية للمستخدم (مثل عدد الحسابات)
async function getUserData(userId) {
    const database = await connectDB();
    const usersCollection = database.collection('users');
    // ابحث عن المستخدم أو أنشئه إذا لم يكن موجوداً
    let user = await usersCollection.findOne({ userId });

    if (!user) {
        user = {
            userId,
            isActivated: false,
            accountsCount: 0,
            activationCode: null,
            isAdmin: userId == config.ADMIN_ID,
        };
        await usersCollection.insertOne(user);
    }
    return user;
}

// ==============================
// 6. معالجة الأوامر والوظائف (كما في كودك الأصلي)
// ==============================

// أمر /start
bot.command('start', async (ctx) => {
    // ... كود معالجة الأمر /start (رسالة الترحيب، الإرشادات، إلخ)
    // يفضل أن يكون بسيطاً، مثل:
    await ctx.reply('مرحباً بك! أنا بوت خدمة الأكواد. استخدم /act لتفعيل حسابك.');
});

// أمر /act
bot.command('act', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        return ctx.reply('الرجاء إدخال الكود بعد الأمر. مثال: /act YOURCODE');
    }
    
    const code = args[1];
    const database = await connectDB();
    const codesCollection = database.collection('codes');
    const usersCollection = database.collection('users');

    try {
        const codeDoc = await codesCollection.findOne({ code, isUsed: false });

        if (codeDoc) {
            // تحديث الكود لـ مستخدم
            await codesCollection.updateOne(
                { _id: codeDoc._id },
                { $set: { isUsed: true, usedBy: ctx.from.id, usedAt: new Date() } }
            );

            // تحديث حالة المستخدم
            await usersCollection.updateOne(
                { userId: ctx.from.id },
                { $set: { isActivated: true, activationCode: code } },
                { upsert: true } // إذا لم يكن موجوداً، قم بإنشائه
            );
            
            ctx.reply('✅ تم تفعيل حسابك بنجاح! يمكنك الآن استخدام خدمات البوت.');
        } else {
            ctx.reply('❌ كود التفعيل غير صحيح أو تم استخدامه مسبقاً.');
        }

    } catch (error) {
        console.error("خطأ في معالجة أمر /act:", error);
        ctx.reply('حدث خطأ أثناء عملية التفعيل. يرجى المحاولة مرة أخرى.');
    }
});


// ... يمكنك إضافة معالجات الأوامر الأخرى هنا (/buyacc, /name, /mycount, /deleteacc)
// ... مع التأكد من أن كل أمر يستخدم دالة connectDB() عند الحاجة لقاعدة البيانات.

// معالجة أي رسالة نصية أخرى
bot.on('text', async (ctx) => {
    // ... ضع هنا المنطق الأساسي لمعالجة رسائل البريد/الأكواد/الـ API
    // (مثلاً: التحقق من التفعيل قبل إرسال طلب إلى Hotmail API)
    
    const user = await getUserData(ctx.from.id);
    if (!user.isActivated) {
         return ctx.reply('🔴 حسابك غير مفعّل. يرجى استخدام /act CODE لتفعيله.');
    }
    
    // مثال على دالة استدعاء API (تعتمد على كودك الأصلي)
    // if (ctx.message.text.includes('@')) {
    //     await ctx.reply('جارٍ إرسال طلب API...');
    //     // هنا يتم وضع كود Axios لاستدعاء Hotmail007 API
    // }
    
    await ctx.reply('تم استقبال رسالتك بنجاح.');
});


// ======================================
// 7. إعداد Webhook لـ Vercel (النقطة الأهم)
// ======================================

// هذه هي الوظيفة التي سيتم استدعاؤها من قبل Vercel عند وصول أي طلب
module.exports = async (req, res) => {
    try {
        // التأكد من أن الاتصال بقاعدة البيانات موجود قبل معالجة الطلب
        await connectDB(); 

        // إرسال طلب الـ Webhook إلى معالج Telegraf
        await bot.webhookCallback('/api')(req, res);

    } catch (error) {
        console.error("خطأ عام في Webhook Vercel:", error);
        // يجب إرسال استجابة HTTP 200 لتجنب إعادة إرسال الرسائل من تيليجرام
        if (!res.headersSent) {
             res.status(200).send('Webhook Processed (Error Ignored for Telegram)');
        }
    }
};