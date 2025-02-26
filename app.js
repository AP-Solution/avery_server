require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 4242;

// Middleware
const cors = require('cors');

app.use(cors({
    origin: ['http://localhost:3000', 'https://avery.com.ua'], 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], 
    allowedHeaders: ['Content-Type', 'Authorization'], 
    credentials: true 
}));

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

// File paths
const messagesFilePath = path.join(__dirname, 'messages.json');
const ordersFilePath = path.join(__dirname, 'orders.json');

// Initialize JSON files if they don't exist
async function initializeFiles() {
    try {
        await fs.access(messagesFilePath);
    } catch {
        await fs.writeFile(messagesFilePath, JSON.stringify([], null, 2));
    }
    try {
        await fs.access(ordersFilePath);
    } catch {
        await fs.writeFile(ordersFilePath, JSON.stringify([], null, 2));
    }
}

// Save message or order to JSON file and forward to admin
async function saveMessage(message, isOrder = false) {
    try {
        const filePath = isOrder ? ordersFilePath : messagesFilePath;
        let items = [];
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            items = JSON.parse(fileContent);
        } catch (parseError) {
            console.error(`Error parsing ${isOrder ? 'orders' : 'messages'}.json, recreating file:`, parseError);
        }

        // Save message
        items.push({
            userId: message.from.id,
            username: message.from.username,
            firstName: message.from.first_name,
            lastName: message.from.last_name,
            message: message.text,
            timestamp: new Date().toISOString()
        });

        await fs.writeFile(filePath, JSON.stringify(items, null, 2));

        // Forward to admin
        await bot.sendMessage(userId, `
New ${isOrder ? 'order' : 'message'} received:
From: ${message.from.first_name} ${message.from.last_name || ''} (@${message.from.username || 'no username'})
Message: ${message.text}
        `);
    } catch (error) {
        console.error('Error saving/forwarding message:', error);
    }
}

// Bot initialization
bot.getMe().then(async (botInfo) => {
    console.log('Bot activated successfully!');
    console.log('Bot username:', botInfo.username);
    await initializeFiles();
}).catch((error) => {
    console.error('Error initializing bot:', error);
});

// Message handler
bot.on('message', async (msg) => {
    try {
        if (msg.text === '/start') {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🛍️ Відкрити магазин', web_app: { url: 'https://avery.com.ua' } }]
                ]
            };
            await bot.sendMessage(msg.chat.id, 'Привіт! Це телеграм бот AVERY, який залюбки доставить твоє повідомлення до людини, що вирішить твоє подарункове питання 💐🍫🎁\n\nЗалиши своє повідомлення, і ми його неодмінно прочитаємо якомога швидше!', {
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
            await bot.sendMessage(msg.chat.id, 'Відкрийте наш магазин прямо в Telegram:', {
                reply_markup: keyboard
            });
        } else {
            // Check if the message is an order
            const isOrder = msg.text.startsWith('🌸 Нове замовлення!');

            // Save message to appropriate file and forward to admin
            await saveMessage(msg, isOrder);

            // Send appropriate confirmation to user
            if (isOrder) {
                await bot.sendMessage(msg.chat.id, '🌸 Ваше замовлення вдало отримано! Найближчим часом вам відповість наш подарунковий спеціаліст 🎀');
            } else {
                await bot.sendMessage(msg.chat.id, '🌟 Дякуємо за ваше повідомлення! Ми отримали його та скоро відповімо.');
            }
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle new orders from website
app.post('/new-order', async (req, res) => {
    try {
        const { customerInfo, order } = req.body;

        // Log items array to debug undefined issue
        console.log('Order items:', JSON.stringify(order.items, null, 2));

        // Format the message
        const message = `🌸 Нове замовлення!\n\n` +
            `👤 Ім'я: ${customerInfo.name}\n` +
            `📞 Телефон: ${customerInfo.phone}\n` +
            `📍 Адреса: ${customerInfo.address}\n` +
            `🕒 Час доставки: ${customerInfo.deliveryTime}\n` +
            `💳 Спосіб оплати: ${customerInfo.paymentMethod === 'card' ? 'Карткою' : 'Готівкою'}\n` +
            `💭 Коментар: ${customerInfo.comment || 'Немає'}\n\n` +
            `🛍️ Замовлення:\n` +
            `${order.items.map(item => {
                return `${item.title || item.name} - ${item.quantity}шт. x ${item.price}грн.`;
            }).join('\n')}\n\n` +
            `💰 Загальна сума: ${order.totalAmount}грн.`;

        // Log the formatted message to console
        console.log('\n=== New Order ===');
        console.log(message);
        console.log('================\n');

        // Create order object in the required format
        const orderObject = {
            userId: null,
            username: null,
            firstName: null,
            lastName: null,
            message: message,
            timestamp: new Date().toISOString()
        };

        // Read and update orders.json
        let orders = [];
        try {
            const fileContent = await fs.readFile(ordersFilePath, 'utf8');
            orders = JSON.parse(fileContent);
        } catch (error) {
            console.error('Error reading orders.json:', error);
            if (error.code === 'ENOENT') {
                orders = [];
            } else {
                throw error;
            }
        }

        orders.push(orderObject);
        await fs.writeFile(ordersFilePath, JSON.stringify(orders, null, 2));

        // Send notification to admin
        const adminMessage = `${message}`;
        await bot.sendMessage(userId, adminMessage);

        console.log('Order processed successfully');
        res.status(200).json({ success: true, message: 'Order received successfully' });
    } catch (error) {
        console.error('Error processing order:', error.message, '\nStack:', error.stack);
        res.status(500).json({ success: false, message: 'Failed to process order: ' + error.message });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
