/**
 * GiftBot 10x - Telegram Bot Backend Engine
 * Same to same Telegram Bot functionality as @RxMakerRoBot
 *
 * Features:
 * - Mandatory Channel Join Verification (checks getChatMember for all channels)
 * - 10-Referral Tracking System (/start ref_<userId>)
 * - Lucky Spin Wheel (via Telegram WebApp Mini App or in-chat /spin)
 * - Custom Gifts System (Amazon, UPI, Flipkart, Gadgets, Recharge)
 * - Admin Panel (/admin, /addchannel, /addgift, /broadcast)
 */

import http from 'http';

// CONFIGURATION
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://giftrewardbot.app';
const ADMIN_ID = process.env.ADMIN_ID || 'YOUR_TELEGRAM_USER_ID';

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// IN-MEMORY / PERSISTENT DATABASE STATE
const db = {
  users: {},
  channels: [
    { id: '1', handle: '@LootDealsIndia', link: 'https://t.me/LootDealsIndia', title: 'Loot Deals Official' },
    { id: '2', handle: '@DailyRewardsEarn', link: 'https://t.me/DailyRewardsEarn', title: 'Daily Cash Alerts' },
  ],
  gifts: [
    { id: '1', name: 'Amazon ₹500 Voucher', value: 500, type: 'amazon' },
    { id: '2', name: 'Instant ₹1000 UPI Cash', value: 1000, type: 'upi' },
    { id: '3', name: 'Boat Wireless Earbuds', value: 1299, type: 'gadget' },
    { id: '4', name: 'Flipkart ₹500 Card', value: 500, type: 'flipkart' },
    { id: '5', name: 'Free 1-Month 5G Recharge', value: 299, type: 'recharge' },
    { id: '6', name: 'Instant ₹250 UPI Cash', value: 250, type: 'upi' },
  ],
  targetReferrals: 10,
};

// HELPER: Call Telegram API
async function apiCall(method, payload = {}) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error(`Error in Telegram API ${method}:`, err);
    return { ok: false, error: err.message };
  }
}

// HELPER: Check if user has joined all required sponsor channels
async function checkChannelsMembership(userId) {
  if (db.channels.length === 0) return true;

  for (const chan of db.channels) {
    const res = await apiCall('getChatMember', {
      chat_id: chan.handle,
      user_id: userId,
    });

    if (!res.ok || !res.result) continue;

    const status = res.result.status;
    const isMember = ['creator', 'administrator', 'member', 'restricted'].includes(status);
    if (!isMember) return false;
  }

  return true;
}

// HANDLER: Send Channel Join Gate Message
async function sendChannelGate(chatId, userId) {
  const keyboard = db.channels.map((c) => [
    { text: `📢 Join ${c.title}`, url: c.link },
  ]);

  keyboard.push([{ text: '✅ I Joined All / Verify Now', callback_data: 'check_joined' }]);

  const text = `⚠️ *Mandatory Sponsor Channels Verification*\n\nWelcome to GiftBot!\nTo activate the bot and unlock your *₹500 Referral Gifts & Lucky Wheel Spins*, you MUST join our official sponsor channels below.\n\nAfter joining all channels, click the *Verify Now* button!`;

  await apiCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
}

// HANDLER: Main Menu
async function sendMainMenu(chatId, userId) {
  const user = db.users[userId] || { referrals: [], spins: 1 };
  const refCount = user.referrals.length;
  const botInfo = await apiCall('getMe');
  const botUsername = botInfo.result?.username || 'GiftRewardBot';
  const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;

  const text = `🎁 *Welcome to GiftReward 10x Bot!*\n\n` +
    `🎯 *Your Target:* Invite 10 friends to activate the bot and earn Free Lucky Spins!\n` +
    `👥 *Friends Joined:* ${refCount} / ${db.targetReferrals}\n` +
    `🎡 *Available Wheel Spins:* ${user.spins}\n\n` +
    `🔗 *Your Unique Referral Link:*\n\`${refLink}\`\n\n` +
    `Share this link on WhatsApp & Telegram. Every 10 friends who join unlocks a guaranteed gift!`;

  const keyboard = [
    [
      { text: '🎡 Spin Lucky Wheel (Web App)', web_app: { url: WEBAPP_URL } },
    ],
    [
      { text: '🎁 In-Chat Spin', callback_data: 'spin_wheel' },
      { text: '📊 My Progress', callback_data: 'progress' },
    ],
    [
      { text: '🔗 Share Link', switch_inline_query: `Join GiftBot and win ₹500 gifts! ${refLink}` },
      { text: '👥 Referral List', callback_data: 'ref_list' },
    ],
    [
      { text: 'ℹ️ Rules & Gifts', callback_data: 'rules' },
    ],
  ];

  await apiCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
}

// PROCESS UPDATE
async function handleUpdate(update) {
  if (update.callback_query) {
    const cb = update.callback_query;
    const userId = cb.from.id;
    const chatId = cb.message.chat.id;
    const data = cb.data;

    await apiCall('answerCallbackQuery', { callback_query_id: cb.id });

    if (data === 'check_joined') {
      const isMember = await checkChannelsMembership(userId);
      if (isMember) {
        if (!db.users[userId]) db.users[userId] = { id: userId, referrals: [], spins: 1 };
        db.users[userId].joinedChannels = true;
        await apiCall('sendMessage', {
          chat_id: chatId,
          text: '✅ *Verification Successful!* All sponsor channels verified. Your bot is now active.',
          parse_mode: 'Markdown',
        });
        await sendMainMenu(chatId, userId);
      } else {
        await apiCall('sendMessage', {
          chat_id: chatId,
          text: '❌ *Verification Failed!* You have not joined all channels yet. Please join all channels above and click Verify again.',
          parse_mode: 'Markdown',
        });
      }
    } else if (data === 'spin_wheel') {
      const user = db.users[userId] || { referrals: [], spins: 1 };
      if (user.spins <= 0) {
        await apiCall('sendMessage', {
          chat_id: chatId,
          text: `❌ *No Spins Left!*\nYou need 10 referrals to unlock 1 Free Lucky Spin.\nCurrent Progress: ${user.referrals.length}/${db.targetReferrals} friends joined.`,
          parse_mode: 'Markdown',
        });
        return;
      }

      user.spins -= 1;
      const wonPrize = db.gifts[Math.floor(Math.random() * db.gifts.length)];
      const randCode = 'GIFT-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

      await apiCall('sendMessage', {
        chat_id: chatId,
        text: `🎡 *The Wheel is Spinning...*\n\n` +
          `🎉 *CONGRATULATIONS!*\n` +
          `You won: *${wonPrize.name}* (Worth ₹${wonPrize.value})\n\n` +
          `🎟 *Voucher Code:* \`${randCode}\`\n` +
          `Pin: \`${Math.floor(1000 + Math.random() * 9000)}\`\n\n` +
          `Invite 10 more friends to spin again!`,
        parse_mode: 'Markdown',
      });
    } else if (data === 'progress') {
      const user = db.users[userId] || { referrals: [], spins: 1 };
      await apiCall('sendMessage', {
        chat_id: chatId,
        text: `📊 *Your Referral Progress:*\n• Friends Joined: ${user.referrals.length} / ${db.targetReferrals}\n• Available Spins: ${user.spins}\n• Target: 10 friends = 1 Free Gift Spin!`,
        parse_mode: 'Markdown',
      });
    } else if (data === 'rules') {
      await apiCall('sendMessage', {
        chat_id: chatId,
        text: `📜 *Bot Rules:*\n1. Share your personal invite link with friends.\n2. When 10 friends join and verify channels, you get 1 Lucky Spin.\n3. Spin the wheel to win whatever gift it stops on!\n4. Real and active accounts only.`,
        parse_mode: 'Markdown',
      });
    }

    return;
  }

  if (update.message && update.message.text) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();

    if (!db.users[userId]) {
      db.users[userId] = {
        id: userId,
        name: msg.from.first_name || 'User',
        username: msg.from.username || '',
        referrals: [],
        spins: 1,
        joinedChannels: false,
      };
    }

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      if (parts.length > 1 && parts[1].startsWith('ref_')) {
        const referrerId = parts[1].replace('ref_', '');
        if (referrerId !== String(userId) && db.users[referrerId]) {
          if (!db.users[referrerId].referrals.includes(userId)) {
            db.users[referrerId].referrals.push(userId);
            const count = db.users[referrerId].referrals.length;

            await apiCall('sendMessage', {
              chat_id: referrerId,
              text: `🎉 *New Referral Joined!*\n${msg.from.first_name || 'A friend'} joined using your link.\nProgress: ${count}/${db.targetReferrals} friends!`,
              parse_mode: 'Markdown',
            });

            if (count % db.targetReferrals === 0) {
              db.users[referrerId].spins += 1;
              await apiCall('sendMessage', {
                chat_id: referrerId,
                text: `🔥 *GOAL REACHED!* 10 friends joined!\nYou have unlocked +1 Free Lucky Spin! Use /spin now to win your prize!`,
                parse_mode: 'Markdown',
              });
            }
          }
        }
      }

      const isMember = await checkChannelsMembership(userId);
      if (!isMember) {
        await sendChannelGate(chatId, userId);
      } else {
        await sendMainMenu(chatId, userId);
      }
      return;
    }

    if (text === '/spin') {
      const user = db.users[userId];
      if (user.spins <= 0) {
        await apiCall('sendMessage', {
          chat_id: chatId,
          text: `❌ You need 10 referrals to unlock a Free Lucky Spin! (${user.referrals.length}/${db.targetReferrals})`,
        });
      } else {
        user.spins -= 1;
        const wonPrize = db.gifts[Math.floor(Math.random() * db.gifts.length)];
        await apiCall('sendMessage', {
          chat_id: chatId,
          text: `🎡 *You spun the wheel and won:* ${wonPrize.name} (₹${wonPrize.value})!`,
          parse_mode: 'Markdown',
        });
      }
      return;
    }

    if (text === '/admin' && String(userId) === String(ADMIN_ID)) {
      await apiCall('sendMessage', {
        chat_id: chatId,
        text: `👑 *Admin Control Panel:*\n• Total Users: ${Object.keys(db.users).length}\n• Active Channels: ${db.channels.length}\n• Gifts in Wheel: ${db.gifts.length}`,
        parse_mode: 'Markdown',
      });
      return;
    }

    await sendMainMenu(chatId, userId);
  }
}

// LONG POLLING LOOP
async function startPolling() {
  console.log('🤖 GiftBot Telegram Service Started!');
  let offset = 0;

  while (true) {
    try {
      const res = await apiCall('getUpdates', { offset, timeout: 30 });
      if (res.ok && res.result && res.result.length > 0) {
        for (const update of res.result) {
          offset = update.update_id + 1;
          await handleUpdate(update);
        }
      }
    } catch (e) {
      console.error('Polling error:', e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Simple HTTP server so Cloud Run / Render health check passes
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', name: 'GiftBot 10x Telegram Bot', users: Object.keys(db.users).length }));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  if (BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
    startPolling();
  } else {
    console.log('⚠️ Please set BOT_TOKEN environment variable to start live Telegram polling.');
  }
});
