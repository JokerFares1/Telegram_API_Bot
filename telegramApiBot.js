// استيراد الإعدادات من ملف config.js
const config = require('./config');

const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const { MongoClient } = require('mongodb'); // 🆕 استيراد مكتبة MongoDB

// استخدام المتغيرات من ملف config
const { 
    BOT_TOKEN, 
    CLIENT_KEY, 
    API_HOST, 
    ADMIN_ID, 
    RETRY_DELAY_MS,
    MONGO_URI, // 🆕 رابط MongoDB
    MONGO_DB_NAME // 🆕 اسم قاعدة البيانات
} = config;

// أسماء ملفات الأسماء (لا تحتاج لتعديل)
const NAME_FILES = {
    man: 'nameman.txt',
    girl: 'namegirl.txt',
    dad: 'namedad.txt'
};

// -----------------------------------------------------------
// 1. إعداد الاتصال بقاعدة البيانات
// -----------------------------------------------------------

let db;
const client = new MongoClient(MONGO_URI);

async function connectDB() {
    try {
        await client.connect();
        db = client.db(MONGO_DB_NAME);
        console.log("✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح.");
    } catch (error) {
        console.error("❌ فشل الاتصال بقاعدة بيانات MongoDB:", error.message);
        // لا نوقف البوت هنا، لكن الوظائف المعتمدة على DB لن تعمل
    }
}

connectDB();

const bot = new Telegraf(BOT_TOKEN);

// -----------------------------------------------------------
// 2. دوال إدارة البيانات (استبدال JSON بـ MongoDB)
// -----------------------------------------------------------

// 🆕 تحميل الأكواد المفعلة
const loadKeys = async () => {
    if (!db) return {};
    const keysCollection = db.collection('access_keys');
    const keysArray = await keysCollection.find({}).toArray();
    // تحويل array إلى object: { code: {id, name, ...} }
    const keysObject = keysArray.reduce((acc, item) => {
        acc[item.code] = item.user;
        return acc;
    }, {});
    return keysObject;
};

// 🆕 حفظ الأكواد (عند التفعيل)
const saveKey = async (code, userObj) => {
    if (!db) return;
    const keysCollection = db.collection('access_keys');
    await keysCollection.updateOne(
        { code: code },
        { $set: { code: code, user: userObj } },
        { upsert: true }
    );
};

// 🆕 توليد وحفظ أكواد جديدة (للمسؤول)
const createNewKeys = async (count) => {
    if (!db) return [];
    const keys = await loadKeys(); // جلب جميع المفاتيح للتحقق من التكرار
    const keysCollection = db.collection('access_keys');
    const newKeys = [];
    const newKeysToInsert = [];

    for (let i = 0; i < count; i++) {
        let uniqueCode;
        do { uniqueCode = generateUniqueCode(); } while (keys.hasOwnProperty(uniqueCode));
        
        keys[uniqueCode] = null; // للتأكد من عدم تكراره في نفس الجلسة
        newKeys.push(uniqueCode);
        newKeysToInsert.push({ code: uniqueCode, user: null });
    }

    if (newKeysToInsert.length > 0) {
        await keysCollection.insertMany(newKeysToInsert);
    }
    return newKeys;
};


// 🆕 التحقق من تفعيل المستخدم
const isUserActivated = async (userId) => {
    if (!db) return false;
    const keysCollection = db.collection('access_keys');
    const userKey = await keysCollection.findOne({ 'user.id': userId });
    return !!userKey;
};

// 🆕 تحديث عداد الاستخدام (Usage)
const updateUserCount = async (userId, count = 1) => {
    if (!db) return;
    const usageCollection = db.collection('usage_data');
    await usageCollection.updateOne(
        { userId: userId },
        { $inc: { count: count } },
        { upsert: true } // ينشئ السجل إذا لم يكن موجوداً
    );
};

// 🆕 تخزين/تحديث الحساب قيد المراقبة
const setMonitoringAccount = async (userId, fullAccountLine) => {
    if (!db) return;
    const monitoringCollection = db.collection('monitoring_accounts');
    await monitoringCollection.updateOne(
        { userId: userId },
        { $set: { userId: userId, account: fullAccountLine } },
        { upsert: true }
    );
};

// 🆕 الحصول على الحساب قيد المراقبة
const getMonitoringAccount = async (userId) => {
    if (!db) return null;
    const monitoringCollection = db.collection('monitoring_accounts');
    const doc = await monitoringCollection.findOne({ userId: userId });
    return doc ? doc.account : null;
};

// 🆕 مسح الحساب قيد المراقبة
const deleteMonitoringAccount = async (userId) => {
    if (!db) return;
    const monitoringCollection = db.collection('monitoring_accounts');
    await monitoringCollection.deleteOne({ userId: userId });
};

// توليد أكواد (تم نقله إلى الدالة العلوية)
const generateUniqueCode = (length = 4) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 3; i++) {
        let segment = '';
        for (let j = 0; j < length; j++) { segment += characters.charAt(Math.floor(Math.random() * characters.length)); }
        code += segment;
        if (i < 2) { code += '-'; }
    }
    return code; 
};


// -----------------------------------------------------------
// 3. دوال الأسماء العشوائية (بدون تغيير)
// -----------------------------------------------------------

const loadNamesFromFile = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return [];
        const data = fs.readFileSync(filePath, 'utf-8');
        return data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    } catch (error) { return []; }
};

let BOY_NAMES = loadNamesFromFile(NAME_FILES.man);
let GIRL_NAMES = loadNamesFromFile(NAME_FILES.girl);
let FATHER_NAMES = loadNamesFromFile(NAME_FILES.dad);

const getRandomElement = (arr) => arr[arr.length > 0 ? Math.floor(Math.random() * arr.length) : 0];

const generateRandomName = (gender) => {
    if (FATHER_NAMES.length === 0) FATHER_NAMES = loadNamesFromFile(NAME_FILES.dad);
    if (gender === 'boy' && BOY_NAMES.length === 0) BOY_NAMES = loadNamesFromFile(NAME_FILES.man);
    if (gender === 'girl' && GIRL_NAMES.length === 0) GIRL_NAMES = loadNamesFromFile(NAME_FILES.girl);

    const firstNames = gender === 'boy' ? BOY_NAMES : GIRL_NAMES;
    
    const firstName = getRandomElement(firstNames);
    const fatherName = getRandomElement(FATHER_NAMES);
    
    return { firstName: firstName || 'N/A', fatherName: fatherName || 'N/A', gender };
};

const formatNameMessage = (nameData) => {
    const genderLabel = nameData.gender === 'boy' ? 'ولد (Boy) 👦' : 'بنت (Girl) 👧';
    return `
**الاسم المقترح (مصري بالإنجليزي):**

**النوع:** ${genderLabel}

**الاسم الأول (الابن/الابنة):**
\`${nameData.firstName}\`

**اسم الأب (العائلة):**
\`${nameData.fatherName}\`
`;
};


// -----------------------------------------------------------
// 4. دوال التفاعل مع Hotmail007 API
// -----------------------------------------------------------

const sendApiRequest = async (endpoint, params = {}) => {
    try {
        const response = await axios.get(`${API_HOST}/api${endpoint}`, {
            params: { clientKey: CLIENT_KEY, ...params },
            headers: { 'Accept': 'application/json' },
            timeout: 15000 
        });

        if (response.data && response.data.code === 0 && response.data.success === true) {
            return { success: true, data: response.data.data };
        } else {
            const errorMessage = response.data && response.data.data ? response.data.data : 'استجابة API غير متوقعة.';
            return { success: false, error: errorMessage };
        }
    } catch (error) {
        let errorMsg = 'خطأ غير معروف في الاتصال بـ API.';
        if (axios.isAxiosError(error)) { errorMsg = `خطأ في الاتصال: ${error.message}`; }
        return { success: false, error: errorMsg };
    }
};

const getBalance = async () => sendApiRequest('/user/balance');
const getMailStock = async () => sendApiRequest('/mail/getStock');
const getMailAccounts = async (mailType, quantity = 1) => sendApiRequest('/mail/getMail', { mailType, quantity: parseInt(quantity) });

const getLatestEmail = async (account, folder = 'inbox') => {
    const parts = account.split(':');
    if (parts.length < 4) { return { success: false, error: "تنسيق حساب غير كامل (يجب أن يحتوي على Refresh Token)." }; }
    const accountParam = parts.slice(0, 4).join(':'); 
    return sendApiRequest('/mail/getLatestMail', { account: accountParam, folder });
};

// دالة سحب الكود اللانهائية (تم التعديل لاستخدام getMonitoringAccount)
const waitForEmailCode = (ctx, accountLine, folder) => {
    return new Promise(async (resolve, reject) => {
        let retries = 0;
        
        const intervalId = setInterval(async () => {
            retries++;
            
            // 🛑 التحقق من وجود الحساب في قاعدة البيانات
            const currentMonitoredAccount = await getMonitoringAccount(ctx.from.id);
            if (currentMonitoredAccount !== accountLine) {
                 clearInterval(intervalId);
                 return reject({ error: "تم إلغاء المراقبة: تم مسح الحساب أو شراء حساب جديد." });
            }

            const result = await getLatestEmail(accountLine, folder);

            if (result.success) {
                clearInterval(intervalId);
                // 🟢 مسح الحساب التلقائي من قاعدة البيانات بعد نجاح المراقبة
                await deleteMonitoringAccount(ctx.from.id);
                resolve({ success: true, content: result.data.content });
            } else {
                // إرسال رسالة للمستخدم كل 6 محاولات (60 ثانية)
                if (retries % 6 === 0) { 
                   try {
                        await ctx.telegram.sendMessage(ctx.from.id, `⏳ ما زلنا نراقب البريد (المحاولة ${retries}...). يرجى الانتظار أو استخدام /deleteacc للإلغاء.`, { parse_mode: 'Markdown' });
                   } catch(e) {
                       console.error(`Error sending retry message to ${ctx.from.id}: ${e.message}`);
                   }
                }
            }
        }, RETRY_DELAY_MS);
    });
};

const inferMailTypeFromEmail = (email) => {
    const domain = email.split('@')[1];
    if (domain && domain.includes('outlook')) return 'outlook';
    if (domain && domain.includes('hotmail')) return 'hotmail';
    return 'unknown'; 
};

// دالة مساعدة لاستخراج الكود وإرسال الرسالة
const sendExtractedCode = async (ctx, emailContent) => {
    let replyMessage = `✅ **وصل الكود بنجاح!**\n\n`;
    
    const codeMatch = emailContent.match(/(\b\d{4,8}\b)/); 

    if (codeMatch) {
        const extractedCode = codeMatch[0];
        replyMessage += `**رمز التحقق هو:** \`${extractedCode}\`\n\n`;
        replyMessage += `**محتوى الرسالة (للتأكد):**\n\`\`\`\n${emailContent.substring(0, 500)}...\n\`\`\``;
    } else {
        replyMessage += `**تعذر استخراج رمز التحقق.**\n\n`;
        replyMessage += `**محتوى الرسالة بالكامل:**\n\`\`\`\n${emailContent.substring(0, 1000)}...\n\`\`\``;
    }

    await ctx.telegram.sendMessage(ctx.from.id, replyMessage, { parse_mode: 'Markdown' });
};


// -----------------------------------------------------------
// 5. لوحة مفاتيح الرد الرئيسية (Reply Keyboard)
// -----------------------------------------------------------

const MAIN_KEYBOARD_OPTIONS = [
    ['🛒 طلب حساب (Buy)', '💰 عرض الرصيد'], 
    ['📦 المخزون المتاح', '✨ توليد اسم'], 
    ['📊 عدد حساباتي', '❌ مسح الحساب (Delete Acc)'] 
];

const MAIN_KEYBOARD = {
    reply_markup: {
        keyboard: MAIN_KEYBOARD_OPTIONS,
        resize_keyboard: true, 
        one_time_keyboard: false,
    }
};

// -----------------------------------------------------------
// 6. طبقات الحماية (Middleware)
// -----------------------------------------------------------

const adminOnly = (ctx, next) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('❌ هذا الأمر متاح للمسؤول فقط.');
    }
    return next();
};

bot.use(async (ctx, next) => {
    if (!ctx.message || !ctx.message.text) return next();
    const userId = ctx.from.id;
    const command = ctx.message.text.split(' ')[0].toLowerCase();

    if (command === '/start' || command === '/act') {
        return next();
    }
    
    if (userId === ADMIN_ID) {
        return next();
    }
    
    // 🆕 استخدام دالة isUserActivated المحدثة
    if (await isUserActivated(userId)) {
        return next();
    } 
    
    return ctx.reply('🔒 يجب تفعيل البوت بكود صلاحية أولاً لاستخدام هذا الأمر. يرجى إرسال `/start` للحصول على إرشادات التفعيل.');
});

// -----------------------------------------------------------
// 7. معالجات الأزرار الرئيسية (Button Handlers)
// -----------------------------------------------------------

const handleHearsCommand = (command, requiredAdmin = false) => (ctx) => {
    if (requiredAdmin && ctx.from.id !== ADMIN_ID) {
        return ctx.reply(`❌ هذا الأمر (${ctx.message.text}) متاح للمسؤول فقط.`);
    }
    ctx.message.text = command;
    return bot.handleUpdate(ctx.update);
};

bot.hears('💰 عرض الرصيد', handleHearsCommand('/balance', true));
bot.hears('📦 المخزون المتاح', handleHearsCommand('/stock', true));
bot.hears('🛒 طلب حساب (Buy)', handleHearsCommand('/buyacc'));
bot.hears('✨ توليد اسم', handleHearsCommand('/name'));
bot.hears('📊 عدد حساباتي', handleHearsCommand('/mycount'));
bot.hears('❌ مسح الحساب (Delete Acc)', handleHearsCommand('/deleteacc'));

// -----------------------------------------------------------
// 8. أوامر المسؤول فقط
// -----------------------------------------------------------

bot.command('generate', adminOnly, async (ctx) => {
    // 🆕 استخدام دالة createNewKeys المحدثة
    const args = ctx.message.text.split(' ').slice(1);
    const count = parseInt(args[0]) || 1;
    if (count < 1 || count > 50) { return ctx.reply('الكمية يجب أن تكون بين 1 و 50.'); }
    const newKeys = await createNewKeys(count);
    let message = `✅ **تم توليد ${newKeys.length} كود جديد بنجاح:**\n\n`;
    newKeys.forEach(key => { message += `• \`${key}\`\n`; });
    message += '\nتم حفظ الأكواد في قاعدة البيانات.';
    ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('keyslist', adminOnly, async (ctx) => {
    // 🆕 استخدام دالة loadKeys المحدثة
    const keys = await loadKeys();
    let message = '🔐 **قائمة المستخدمين المفعلين وأكوادهم:**\n\n';
    let count = 0;
    for (const [key, userObj] of Object.entries(keys)) {
        if (userObj !== null && typeof userObj === 'object') {
            count++;
            const name = userObj.name || 'N/A';
            const username = userObj.username || `(ID: ${userObj.id})`;
            message += `• الكود: \`${key}\`\n  مفعل بواسطة: **${name}** ${username}\n  --------------------------------------\n`;
        }
    }
    if (count === 0) { message = '❌ لا يوجد مستخدمون مفعلون حاليًا.'; } 
    else { message = `✅ **إجمالي المستخدمين المفعلين:** ${count}\n\n` + message; }
    ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('usage', adminOnly, async (ctx) => {
    if (!db) return ctx.reply('❌ قاعدة البيانات غير متصلة.');
    // 🆕 سحب بيانات الاستخدام مباشرة من MongoDB
    const usageCollection = db.collection('usage_data');
    const allUsage = await usageCollection.find({}).toArray();
    const keys = await loadKeys(); // لجلب أسماء المستخدمين

    let usageMessage = '📊 **تقرير استخدام البوت:**\n';
    let totalAccounts = 0;
    
    // إنشاء خريطة للمستخدمين المفعلين للبحث السريع عن الاسم
    const activeUsersMap = {};
    for (const userObj of Object.values(keys)) {
        if (userObj && userObj.id) activeUsersMap[userObj.id] = userObj;
    }

    for (const record of allUsage) {
        const userId = record.userId;
        const count = record.count || 0;
        const userObj = activeUsersMap[userId] || { name: 'مستخدم غير مفعل', username: `(ID: ${userId})` };
        
        const name = userObj.name || 'N/A';
        const username = userObj.username || `(ID: ${userId})`;
        totalAccounts += count;
        usageMessage += `• **${name}** ${username}\n  الحسابات المستخرجة: **${count}**\n`;
    }
    
    usageMessage = `**الإجمالي المستخرج:** ${totalAccounts} حساب\n\n` + usageMessage;
    ctx.reply(usageMessage, { parse_mode: 'Markdown' });
});

bot.command('broadcast', adminOnly, async (ctx) => {
    const messageToBroadcast = ctx.message.text.split(' ').slice(1).join(' ');
    if (!messageToBroadcast) { return ctx.reply('⚠️ يرجى كتابة الرسالة بعد الأمر:\n`/broadcast هذه رسالة البث الهامة.`'); }
    
    // 🆕 جلب الأكواد المفعلة من قاعدة البيانات للحصول على IDs
    const keys = await loadKeys();
    const activeUserIds = new Set();
    for (const userObj of Object.values(keys)) {
        if (userObj !== null && typeof userObj === 'object' && userObj.id) { activeUserIds.add(userObj.id); }
    }
    let successCount = 0;
    let failureCount = 0;
    await ctx.reply(`⏳ جاري إرسال رسالة البث إلى ${activeUserIds.size} مستخدم مفعل...`);
    for (const userId of activeUserIds) {
        try {
            await ctx.telegram.sendMessage(userId, `📣 **رسالة من المسؤول:**\n\n${messageToBroadcast}`, { parse_mode: 'Markdown' });
            successCount++;
        } catch (error) { failureCount++; }
    }
    ctx.reply(`✅ **تم الانتهاء من عملية البث بنجاح.**\n- تم الإرسال إلى: **${successCount}**\n- الإخفاقات: **${failureCount}**`);
});

bot.command('balance', adminOnly, async (ctx) => {
    const result = await getBalance();
    if (result.success) {
        ctx.reply(`💰 **رصيدك الحالي هو:** ${result.data} $`);
    } else {
        ctx.reply(`❌ فشل في سحب الرصيد: ${result.error}`);
    }
});

bot.command('stock', adminOnly, async (ctx) => { 
    await ctx.reply('جاري سحب المخزون...');
    const result = await getMailStock();
    if (result.success) {
        ctx.reply(`📦 **المخزون المتاح:**\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``, { parse_mode: 'Markdown' });
    } else {
         ctx.reply(`❌ فشل في سحب المخزون: ${result.error}`);
    }
});

// -----------------------------------------------------------
// 9. الأوامر الوظيفية (للمفعلين)
// -----------------------------------------------------------

bot.start(async (ctx) => {
    const userName = ctx.from.first_name;
    // 🆕 استخدام دالة isUserActivated المحدثة
    const isActivated = await isUserActivated(ctx.from.id);

    if (isActivated) {
        return ctx.reply(`👋 مرحباً بك مجدداً يا ${userName}! يمكنك استخدام الأزرار أدناه.`, MAIN_KEYBOARD);
    }

    ctx.reply(`
👋 أهلاً بك يا ${userName}!
🔒 **يجب تفعيل البوت** بكود صلاحية أولاً لاستخدام معظم الميزات.
**لتفعيل البوت:** يرجى إدخال كود الصلاحية الخاص بك باستخدام الأمر:
\`\`\`
/act كود_الصلاحية
\`\`\`
`, { parse_mode: 'Markdown' });

    ctx.reply('يمكنك استخدام الأزرار أدناه:', MAIN_KEYBOARD);
});

bot.command('act', async (ctx) => {
    const userId = ctx.from.id;
    if (await isUserActivated(userId)) { return ctx.reply('⚠️ البوت مفعل بالفعل على حسابك.'); }
    const args = ctx.message.text.split(' ').slice(1);
    const codeAttempt = args.length > 0 ? args[0].trim().toUpperCase() : null;
    if (!codeAttempt) { return ctx.reply('⚠️ يرجى إدخال كود الصلاحية بعد الأمر:\n`/act كود_الصلاحية`'); }
    
    // 🆕 التحقق من الكود في DB
    const keysCollection = db.collection('access_keys');
    const keyDoc = await keysCollection.findOne({ code: codeAttempt });

    if (keyDoc) {
        if (keyDoc.user === null) {
            const userObj = {
                id: userId,
                name: ctx.from.first_name,
                username: ctx.from.username ? `@${ctx.from.username}` : `(ID: ${userId})`
            };
            // 🆕 حفظ الكود في DB
            await saveKey(codeAttempt, userObj);
            ctx.reply(`🎉 تهانينا! تم تفعيل كود الصلاحية بنجاح.`);
            return ctx.reply('يمكنك الآن استخدام الأزرار أدناه:', MAIN_KEYBOARD); 

        } else { return ctx.reply(`❌ هذا الكود (\`${codeAttempt}\`) مستخدم بالفعل بواسطة شخص آخر.`); }
    } else { return ctx.reply('❌ كود صلاحية غير صحيح.'); }
});

// الأمر /buyacc (لعرض خيارات الشراء)
bot.command('buyacc', async (ctx) => {
    const userId = ctx.from.id;
    // 🛑 قيد الشراء: التحقق من وجود حساب قيد المراقبة (في DB)
    if (await getMonitoringAccount(userId)) {
         return ctx.reply('⚠️ لا يمكنك شراء حساب جديد الآن! يجب مسح الحساب الحالي أولاً باستخدام الزر **"❌ مسح الحساب"** (إذا لم يصل الكود) أو الانتظار حتى وصول الكود ومسحه تلقائياً.');
    }
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'outlook', callback_data: 'request_mail_outlook' }, 
                    { text: 'hotmail', callback_data: 'request_mail_hotmail' }
                ]
            ]
        }
    };
    ctx.reply('اختر نوع الحساب المطلوب (الأقل سعراً):', { ...keyboard });
});

// الأمر /deleteacc
bot.command('deleteacc', async (ctx) => {
    const userId = ctx.from.id;
    // 🆕 جلب الحساب من DB
    const accountLine = await getMonitoringAccount(userId);
    if (accountLine) {
        // 🔴 مسح الحساب يدوياً من DB
        const account = accountLine.split(':')[0];
        await deleteMonitoringAccount(userId);
        return ctx.reply(`🗑️ **تم مسح الحساب بنجاح!**
الحساب المحذوف: \`${account}\`
يمكنك الآن شراء حساب جديد.`);
    } else {
        return ctx.reply('⚠️ لا يوجد حساب حالياً قيد المراقبة ليتم مسحه.');
    }
});


const handleBuyCommand = async (ctx) => {
    const quantity = 1; 
    const args = ctx.message.text.split(' ').slice(1);
    const mailType = args[0];
    const userId = ctx.from.id;

    // 🛑 قيد الشراء: التحقق مرة أخرى قبل بدء عملية API
    if (await getMonitoringAccount(userId)) {
         return ctx.reply('⚠️ لا يمكنك شراء حساب جديد الآن! يجب مسح الحساب الحالي أولاً.');
    }

    if (!mailType) { return ctx.reply('⚠️ صيغة الأمر غير صحيحة. استخدم: `/buyacc` لاختيار نوع الحساب.'); }
    await ctx.reply(`جاري محاولة شراء **1** حساب من نوع **${mailType}**...`, { parse_mode: 'Markdown' });
    
    const result = await getMailAccounts(mailType, quantity);

    if (result.success) {
        const accountsList = result.data.split('|').filter(acc => acc.trim() !== '');
        if (accountsList.length > 0) {
            const fullAccountLine = accountsList[0];
            const emailOnly = fullAccountLine.split(':')[0];
            const inferredType = inferMailTypeFromEmail(emailOnly);

            // 🟢 تخزين الحساب الجديد في DB
            await setMonitoringAccount(userId, fullAccountLine); 

            const rebuyKeyboard = inferredType !== 'unknown' ? {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🔄 Rebuy ${inferredType.toUpperCase()} (1)`, callback_data: `rebuy_${inferredType}` }]
                    ]
                }
            } : {};

            await ctx.reply(`
✅ **تم الشراء بنجاح!** (1 حساب)
**البريد الإلكتروني:**
\`${emailOnly}\`

⏳ **جاري بدء مراقبة البريد...** (المحاولة كل ${RETRY_DELAY_MS / 1000} ثوانٍ). سأرسل الكود فور وصوله.
`, { parse_mode: 'Markdown', ...rebuyKeyboard });
            
            // 🆕 تحديث عداد الاستخدام في DB
            await updateUserCount(userId, 1);

            // 🚀 بدء المراقبة التلقائية فوراً
            try {
                const result = await waitForEmailCode(ctx, fullAccountLine, 'inbox');
                
                // يتم مسح الحساب تلقائياً داخل دالة waitForEmailCode عند النجاح
                await sendExtractedCode(ctx, result.content); 
                
            } catch (err) {
                // إذا فشلت المراقبة (عادةً بسبب المسح اليدوي)
                if (err.error.includes("تم إلغاء المراقبة")) {
                    ctx.reply('⚠️ **تم إلغاء المراقبة التلقائية.** يمكنك شراء حساب جديد.');
                } else {
                    ctx.reply(`❌ فشلت مراقبة البريد التلقائية: ${err.error}. يرجى استخدام /deleteacc إذا كنت تريد الشراء مرة أخرى.`);
                }
            }


        } else { ctx.reply('❌ نجحت عملية الشراء لكن لم يتم إرجاع بيانات الحساب.'); }

    } else {
        ctx.reply(`❌ فشل في عملية الشراء لـ ${mailType}:\n${result.error}\n\n⚠️ **لا يوجد حسابات متوفرة بهذا النوع حالياً.**`);
    }
};

bot.command('buy', handleBuyCommand);


bot.command('name', async (ctx) => {
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '👦 Man (ولد)', callback_data: 'generate_name_man' }, { text: '👧 Girl (بنت)', callback_data: 'generate_name_girl' }]
            ]
        }
    };
    ctx.reply('رجاءً اختر نوع الاسم الذي تريد توليده:', { ...keyboard });
});

bot.command('mycount', async (ctx) => {
    const userId = ctx.from.id;
    if (!db) return ctx.reply('❌ قاعدة البيانات غير متصلة.');
    
    // 🆕 سحب عداد الاستخدام من DB
    const usageCollection = db.collection('usage_data');
    const userUsage = await usageCollection.findOne({ userId: userId });
    const count = userUsage ? userUsage.count : 0;
    
    ctx.reply(`📊 لقد قمت باستخراج **${count}** حساب حتى الآن عبر هذا البوت.`, { parse_mode: 'Markdown' });
});

// -----------------------------------------------------------
// 10. معالج زر الـ Callback
// -----------------------------------------------------------

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    
    // 🆕 التحقق من التفعيل هنا
    if (data.startsWith('rebuy_') || data.startsWith('request_mail_')) {
        if (!(await isUserActivated(userId))) {
             return ctx.answerCbQuery('🔒 يجب تفعيل البوت أولاً باستخدام /act.');
        }
        // 🛑 قيد الشراء: التحقق من وجود حساب قيد المراقبة
        if (await getMonitoringAccount(userId)) {
             return ctx.answerCbQuery('⚠️ يجب مسح الحساب الحالي أولاً باستخدام /deleteacc أو الانتظار حتى وصول الكود.', true);
        }
        
        const mailType = data.substring(data.startsWith('rebuy_') ? 6 : 13);
        await ctx.answerCbQuery(`جاري طلب شراء 1 حساب من نوع ${mailType}...`);
        ctx.message = { text: `/buy ${mailType}`, from: ctx.from };
        await handleBuyCommand(ctx);
        
    } else if (data.startsWith('generate_name_') || data.startsWith('change_name_')) {
        const type = data.includes('man') ? 'boy' : 'girl';
        const nameData = generateRandomName(type);
        const messageText = formatNameMessage(nameData);
        
        const keyboard = [
            [{ text: '🔄 تغيير الاسم (Change)', callback_data: `change_name_${type === 'boy' ? 'man' : 'girl'}` }],
            [{ text: '👦 Man (ولد)', callback_data: 'generate_name_man' }, { text: '👧 Girl (بنت)', callback_data: 'generate_name_girl' }]
        ];
        
        try {
            await ctx.editMessageText(messageText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            await ctx.answerCbQuery('تم توليد الاسم بنجاح.');
        } catch (e) {
             await ctx.reply(messageText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            await ctx.answerCbQuery('تم توليد الاسم بنجاح.');
        }
    } else {
         ctx.answerCbQuery();
    }
});


// -----------------------------------------------------------
// 11. تشغيل البوت
// -----------------------------------------------------------

bot.launch()
    .then(() => console.log('✅ البوت يعمل الآن ويستمع للأوامر...'))
    .catch((err) => console.error('❌ خطأ في تشغيل البوت:', err));

process.once('SIGINT', () => {
    bot.stop('SIGINT');
    client.close(); // إغلاق اتصال MongoDB عند إيقاف البوت
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    client.close(); // إغلاق اتصال MongoDB عند إيقاف البوت
});