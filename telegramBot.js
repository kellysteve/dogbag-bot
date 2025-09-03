const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Replace with your Telegram bot token from @BotFather
const TELEGRAM_BOT_TOKEN = '7063658813:AAEohCrSRppNFykkADk7lzMe90-PB4IaPh0';
const WEBSITE_UPLOAD_URL = 'https://dogbag.zone.id/upload'; // Your website's upload endpoint
const WEBSITE_BASE_URL = 'https://dogbag.zone.id/uploads/'; // Where files are hosted

// Initialize Telegram bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `📁 Welcome to the Dog Bag Bot!\n\nSimply send me any file (up to 1GB) and I'll upload it to ${WEBSITE_BASE_URL} and give you the shareable link.`);
});

// Handle document messages
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  const fileSize = msg.document.file_size;

  // Check file size (1GB limit)
  if (fileSize > 1024 * 1024 * 1024) {
    return bot.sendMessage(chatId, '❌ File is too large. Maximum size is 1GB.');
  }

  try {
    // Send "processing" message
    const processingMsg = await bot.sendMessage(chatId, `⏳ Processing your file "${fileName}" (${formatFileSize(fileSize)})...`);

    // Get file from Telegram
    const fileLink = await bot.getFileLink(fileId);
    const response = await axios.get(fileLink, { responseType: 'stream' });

    // Create temp file
    const tempFilePath = path.join(__dirname, 'temp', fileName);
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    writer.on('finish', async () => {
      try {
        // Upload to your website
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFilePath));

        const uploadResponse = await axios.post(WEBSITE_UPLOAD_URL, formData, {
          headers: formData.getHeaders()
        });

        // Get the URL from your website's response
        const fileUrl = uploadResponse.data.url || `${WEBSITE_BASE_URL}${path.basename(tempFilePath)}`;

        // Send the link to user
        await bot.editMessageText(`✅ File uploaded successfully!\n\n🔗 Download link:\n${fileUrl}`, {
          chat_id: chatId,
          message_id: processingMsg.message_id
        });

        // Clean up temp file
        fs.unlink(tempFilePath, () => {});

      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        await bot.editMessageText('❌ Failed to upload file to website. Please try again later.', {
          chat_id: chatId,
          message_id: processingMsg.message_id
        });
        fs.unlink(tempFilePath, () => {});
      }
    });

    writer.on('error', async (err) => {
      console.error('File download error:', err);
      await bot.editMessageText('❌ Failed to download file from Telegram. Please try again.', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
    });

  } catch (error) {
    console.error('Error:', error);
    bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// Handle photos (they come as photos, not documents)
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  // Get the highest quality photo
  const photo = msg.photo[msg.photo.length - 1];
  const fileId = photo.file_id;

  try {
    const processingMsg = await bot.sendMessage(chatId, '⏳ Processing your photo...');

    const fileLink = await bot.getFileLink(fileId);
    const response = await axios.get(fileLink, { responseType: 'stream' });

    const tempFilePath = path.join(__dirname, 'temp', `photo_${Date.now()}.jpg`);
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    writer.on('finish', async () => {
      try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFilePath));

        const uploadResponse = await axios.post(WEBSITE_UPLOAD_URL, formData, {
          headers: formData.getHeaders()
        });

        const fileUrl = uploadResponse.data.url || `${WEBSITE_BASE_URL}${path.basename(tempFilePath)}`;

        await bot.editMessageText(`✅ Photo uploaded successfully!\n\n🔗 Download link:\n${fileUrl}`, {
          chat_id: chatId,
          message_id: processingMsg.message_id
        });

        fs.unlink(tempFilePath, () => {});

      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        await bot.editMessageText('❌ Failed to upload photo to website.', {
          chat_id: chatId,
          message_id: processingMsg.message_id
        });
        fs.unlink(tempFilePath, () => {});
      }
    });

  } catch (error) {
    console.error('Error:', error);
    bot.sendMessage(chatId, '❌ Failed to process photo.');
  }
});

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Create temp directory if it doesn't exist
if (!fs.existsSync(path.join(__dirname, 'temp'))) {
  fs.mkdirSync(path.join(__dirname, 'temp'));
}

console.log('Telegram bot is running...');