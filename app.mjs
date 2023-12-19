import { existsSync, readFileSync, writeFileSync } from "fs";
import { forEachLimit, queue } from "async";
import fetch from "node-fetch";
import { ethers } from "ethers";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as dotenv from "dotenv";
dotenv.config();

const get_auth = async (item) => {
    const message = `You are claiming the Frame Chapter One Airdrop with the following address: ${item.address.toLowerCase()}`;
    const wallet = new ethers.Wallet(item.private_key);
    const signature = await wallet.signMessage(message);

    const response = await fetch("https://claim.frame-api.xyz/authenticate", {
        method: "POST",
        headers: {
            Host: "claim.frame-api.xyz",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            Referer: "https://www.frame.xyz/",
            "Content-Type": "application/json",
            Origin: "https://www.frame.xyz",
        },
        body: JSON.stringify({
            signature: signature,
            address: item.address,
        }),
        agent: new HttpsProxyAgent(process.env.PROXY),
    });

    if (response.status === 200) {
        return await response.json();
    }

    throw new Error(`frame :: get_auth :: ${response.status}`);
};

const get_user_meta = async (item) => {
    const response = await fetch("https://claim.frame-api.xyz/user", {
        headers: {
            Host: "claim.frame-api.xyz",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            Referer: "https://www.frame.xyz/",
            "Content-Type": "application/json",
            Authorization: `Bearer ${item.frame.auth}`,
            Origin: "https://www.frame.xyz",
        },
        agent: new HttpsProxyAgent(process.env.PROXY),
    });

    if (response.status === 200) {
        return await response.json();
    }

    throw new Error(`frame :: get_user_meta :: ${response.status}`);
};

const claim = async (item) => {
    const response = await fetch("https://claim.frame-api.xyz/user/claim", {
        method: "POST",
        headers: {
            authority: "claim.frame-api.xyz",
            accept: "*/*",
            "accept-language": "en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7",
            authorization: `Bearer ${item.frame.auth}`,
            "content-type": "application/json",
            origin: "https://www.frame.xyz",
            referer: "https://www.frame.xyz/",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        },
        agent: new HttpsProxyAgent(process.env.PROXY),
    });

    if (response.status === 201) {
        return await response.json();
    }

    throw new Error(`frame :: claim :: ${response.status}`);
};
const checker = (wallets, wallet_state) => {
    return new Promise((r) => {
        forEachLimit(
            wallets,
            10,
            async (item) => {
                if (!item.frame) {
                    item.frame = {
                        auth: "",
                    };
                }
                if (!item.frame.auth) {
                    try {
                        const { token } = await get_auth(item);
                        item.frame.auth = token;
                        wallet_state.push("");
                        //console.log(`::INFO :: ${item.address} :: $FRAME SIGNUP :: COMPLETED`);
                    } catch (e) {
                        //console.log(`xxINFO :: ${item.address} :: $FRAME SIGNUP :: ${e.message}`);
                    }
                }

                if (item.frame.auth && !item.frame.rank) {
                    try {
                        const { rank, totalAllocation } = await get_user_meta(item);
                        if (rank) {
                            item.frame.rank = rank;
                            item.frame.frame = totalAllocation;
                            //console.log(`::INFO :: ${item.address} :: $FRAME CHECKER :: ${item.frame.frame} $FRAME`);
                        } else {
                            console.log(`xxINFO :: ${item.address} :: $FRAME CHECKER :: NOT ELIGIBLE`);
                        }
                    } catch (e) {
                        console.log(`xxINFO :: ${item.address} :: $FRAME CHECKER :: ${e.message}`);
                    }
                }

                if (item.frame.auth && item.frame.rank && !item.frame.claimed) {
                    try {
                        const { message } = await claim(item);
                        item.frame.claimed = true;
                        wallet_state.push("");
                        console.log(`::INFO :: ${item.address} :: $FRAME CLAIMED :: ${message} :: ${item.frame.frame} $FRAME`);
                    } catch (e) {
                        console.log(`xxINFO :: ${item.address} :: $FRAME CLAIMED :: ${e.message}`);
                    }
                }
            },
            (e) => {
                if (e) {
                    console.log(e);
                }
                r();
            },
        );
    });
};

(async () => {
    const task = process.argv[2];
    const WALLET_PATH = "wallets.json";
    if (!existsSync(WALLET_PATH)) {
        writeFileSync(WALLET_PATH, "[]");
    }

    const wallets = JSON.parse(readFileSync(WALLET_PATH, "utf-8"));
    const wallet_state = queue((_, cb) => {
        writeFileSync(WALLET_PATH, JSON.stringify(wallets));
        cb(null);
    }, 1);

    switch (task) {
        case "import":
            {
                console.log("::INFO IMPORT STARTED\n");
                const keys = readFileSync("import", "utf-8").split("\n");
                for (let private_key of keys) {
                    private_key = private_key.toLowerCase().replace(/(\r\n|\n|\r)/gm, "");
                    if (JSON.stringify(wallets).indexOf(private_key) === -1) {
                        const wallet = new ethers.Wallet(private_key);
                        wallets.push({
                            private_key,
                            address: wallet.address,
                        });
                        console.log(`::INFO :: WALLET IMPORTED :: ${wallet.address}`);
                    }
                }
                writeFileSync(WALLET_PATH, JSON.stringify(wallets));
                console.log("\n::INFO IMPORT COMPLETED");
            }
            break;
        case "checker": {
            try {
                console.log(`\n::INFO :: FRAME CHECKER :: STARTED`);
                await checker(wallets, wallet_state);
                console.log(`\n::INFO :: FRAME CHECKER :: COMPLETED`);
            } catch (e) {
                console.log(`::ERROR :: FRAME CHECKER :: ${e.message}`);
            }
            break;
        }
    }
})();
