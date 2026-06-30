async function replyAndDelete(client, message, text) {
    await message.delete();
    if (client.config.settings.chatfeedback) {
        await message.channel.send({ content: text });
    }
}

const commands = [
    {
        config: { name: "pause" },
        run: async (client, message) => {
            if (client.global.paused) {
                await replyAndDelete(
                    client,
                    message,
                    "Bot is already paused!!!",
                );
            } else {
                client.global.paused = true;
                client.rpc("update");
                await replyAndDelete(client, message, "Paused :)");
            }
        },
    },
    {
        config: { name: "restart", aliases: ["reboot", "stop"] },
        run: async (client, message) => {
            await message.channel.send("The bot is being restarted...");
            client.destroy();
            setTimeout(() => process.exit(1), 1000);
        },
    },
    {
        config: { name: "start", aliases: ["resume"] },
        run: async (client, message) => {
            if (!client.global.paused) {
                return replyAndDelete(
                    client,
                    message,
                    "Bot is already working!!!",
                );
            }
            if (client.global.captchadetected)
                client.global.captchadetected = false;
            client.global.paused = false;
            client.rpc("update");
            if (!client.global.temp.started) {
                client.global.temp.started = true;
                await replyAndDelete(
                    client,
                    message,
                    "BOT started have fun ;)",
                );
                setTimeout(
                    () => require("../services/mainHandler.js")(client),
                    1000,
                );
            } else {
                await replyAndDelete(client, message, "Resuming :)");
            }
        },
    },
    {
        config: { name: "stats" },
        run: async (client, message) => {
            const totals = client.global.total;
            const seconds = Math.floor(process.uptime());
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const uptime = `${days}d ${hours}h ${minutes}m ${seconds % 60}s`;
            const stats = `
OwO Farm Bot Stable Statistics:
===================
- Hunt: ${totals.hunt}
- Battle: ${totals.battle}
- Captcha: ${totals.captcha}
- Pray: ${totals.pray}
- Curse: ${totals.curse}
- Vote: ${totals.vote}
- Giveaway: ${totals.giveaway}
===================
- Uptime: ${uptime}
        `;
            await replyAndDelete(client, message, `\`\`\`${stats}\`\`\``);
        },
    },
];

module.exports = commands;
