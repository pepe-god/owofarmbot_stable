exports.removeInvisibleChars = (str) => {
    const invisibleRegex = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g;
    return str.replace(invisibleRegex, "");
};

exports.waitForMessage = (client, channel, filter, timeout = 6100) => {
    return new Promise((resolve) => {
        const listener = (msg) => {
            if (filter(msg)) {
                clearTimeout(timer);
                client.off("messageCreate", listener);
                resolve(msg);
            }
        };

        const timer = setTimeout(() => {
            client.off("messageCreate", listener);
            const collector = channel.createMessageCollector({
                filter,
                time: timeout,
            });
            collector.on("collect", (msg) => {
                collector.stop();
                resolve(msg);
            });
            collector.on("end", () => resolve(null));
        }, timeout);

        client.on("messageCreate", listener);
    });
};

exports.commandrandomizer = (arr) =>
    arr[Math.floor(Math.random() * arr.length)];
exports.getrand = (min, max) => Math.random() * (max - min) + min;

exports.waitWhileBusy = async (client) => {
    while (
        client.global.paused ||
        client.global.captchadetected ||
        client.global.inventory ||
        client.global.checklist
    ) {
        await client.delay(3000);
    }
};

exports.parseDuration = (str) => {
    const regex = /(\d+)([SMHD])/g;
    const matches = str.matchAll(regex);
    let ms = 0;
    for (const match of matches) {
        const time = parseInt(match[1], 10);
        const unit = match[2];
        if (unit === "S") ms += time * 1000;
        else if (unit === "M") ms += time * 60 * 1000;
        else if (unit === "H") ms += time * 60 * 60 * 1000;
        else if (unit === "D") ms += time * 24 * 60 * 60 * 1000;
    }
    return ms;
};
