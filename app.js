require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 4242;

// CORS configuration
const corsOptions = {
    origin: 'https://avery.com.ua',
    methods: ['POST'],
    optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));

// Telegram bot configuration
const token = process.env.TELEGRAM_BOT_TOKEN;
const userId = process.env.TELEGRAM_USER_ID;
const bot = new TelegramBot(token, { polling: true });

// Set bot commands
bot.setMyCommands([
    { command: '/start', description: 'Start the bot' },
    { command: '/store', description: 'Крамниця AVERY (у браузері)' },
    { command: '/shop', description: 'Крамниця AVERY (у Telegram)' }
]);

// Messages file path
const messagesFilePath = path.join(__dirname, 'messages.json');

// Initialize messages file if it doesn't exist
async function initializeMessagesFile() {
    try {
        await fs.access(messagesFilePath);
    } catch {
        await fs.writeFile(messagesFilePath, JSON.stringify([], null, 2));
    }
}

// Save message to JSON file
async function saveMessage(message) {
    try {
        const messages = JSON.parse(await fs.readFile(messagesFilePath, 'utf8'));
        messages.push({
            userId: message.from.id,
            username: message.from.username,
            firstName: message.from.first_name,
            lastName: message.from.last_name,
            message: message.text,
            timestamp: new Date().toISOString()
        });
        await fs.writeFile(messagesFilePath, JSON.stringify(messages, null, 2));
        
        // Forward message to admin
        await bot.sendMessage(userId, `
New message received:
From: ${message.from.first_name} ${message.from.last_name || ''} (@${message.from.username || 'no username'})
Message: ${message.text}
        `);
    } catch (error) {
        console.error('Error saving message:', error);
    }
}

// Bot initialization confirmation
bot.getMe().then(async (botInfo) => {
    console.log('Bot activated successfully!');
    console.log('Bot username:', botInfo.username);
    await initializeMessagesFile();
}).catch((error) => {
    console.error('Error initializing bot:', error);
});

// Welcome message and message handler
bot.on('message', async (msg) => {
    try {
        // If this is the first message from user or /start command
        if (msg.text === '/start') {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🛍️ Відкрити магазин', web_app: { url: 'https://avery.com.ua' } }]
                ]
            };
            await bot.sendMessage(msg.chat.id, 'Привіт! Це телеграм бот AVERY, який залюбки доставить твоє повідомлення до людини, що вирішить твоє подарункове питання 💐🍫🎁\n\nЗалиши своє повідомлення, і ми його неодмінно прочитаємо якомога швидше! \n\n Для оформлення замовлення, скопіюй його після заповнення форми та надішли мені', {
                reply_markup: keyboard
            });
        } else if (msg.text === '/store') {
            await bot.sendMessage(msg.chat.id, '🛍️ Відвідайте наш магазин: avery.com.ua', {
                disable_web_page_preview: false
            });
        } else if (msg.text === '/shop') {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🛍️ Відкрити магазин', web_app: { url: 'https://avery.com.ua' } }]
                ]
            };
            await bot.sendMessage(msg.chat.id, '🎁 Відкрийте наш магазин прямо в Telegram:', {
                reply_markup: keyboard
            });
        } else {
            // Save message to JSON file
            await saveMessage(msg);
            // Confirm receipt to user
            await bot.sendMessage(msg.chat.id, 'Дякуємо за ваше повідомлення! Ми отримали його та скоро відповімо. 🌟');
        }
    } catch (error) {
        console.error('Error in message handler:', error);
    }
});

// Verify Telegram Web App data
function verifyTelegramWebAppData(data) {
    try {
        // You can add additional verification here if needed
        return true;
    } catch (error) {
        console.error('Verification error:', error);
        return false;
    }
}

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Handle new orders
app.post('/new-order', async (req, res) => {
    try {
        const { customerInfo, order } = req.body;
        
        // Format payment method
        const paymentMethodText = customerInfo.paymentMethod === 'card' ? 'Картою' : 'Готівкою';

        // Format cart items
        const cartItemsFormatted = order.items
            .map(item => `${item.title} - ${item.quantity}шт. x ${item.price}грн.`)
            .join('\n');

        // Format order message
        const orderMessage = `
🌸 Нове замовлення!

👤 Ім'я: ${customerInfo.name}
📞 Телефон: ${customerInfo.phone}
📍 Адреса: ${customerInfo.address}
🕒 Час доставки: ${customerInfo.deliveryTime}
💳 Спосіб оплати: ${paymentMethodText}
💭 Коментар: ${customerInfo.comment || 'Немає'}

🛍️ Замовлення:
${cartItemsFormatted}

💰 Загальна сума: ${order.totalAmount}грн.`;

        // Send order to admin
        await bot.sendMessage(userId, orderMessage);
        
        // Save order to file
        const ordersFile = path.join(__dirname, 'orders.json');

        let orders = [];
        try {
            const fileContent = await fs.readFile(ordersFile, 'utf8');
            orders = JSON.parse(fileContent);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty array
        }

        // Add new order with timestamp
        orders.push({
            timestamp: new Date().toISOString(),
            customerInfo,
            order,
            formatted: orderMessage
        });

        // Save updated orders
        await fs.writeFile(ordersFile, JSON.stringify(orders, null, 2));
        
        res.json({ 
            success: true, 
            message: 'Замовлення успішно відправлено!' 
        });
    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Помилка при обробці замовлення' 
        });
    }
});

// Get saved orders (optional, for admin panel)
app.get('/orders', async (req, res) => {
    try {
        const ordersFile = path.join(__dirname, 'orders.json');
        const fileContent = await fs.readFile(ordersFile, 'utf8');
        const orders = JSON.parse(fileContent);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Помилка при отриманні замовлень' 
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
