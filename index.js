const { resolve } = require("path");
const puppeteer = require("puppeteer");

const defaultUrl =
  "https://www.zhipin.com/web/geek/job?query=%E5%89%8D%E7%AB%AF&city=100010000&experience=102&salary=405&page=1"; // 包含筛选条件的URL页面。
const mode = 0; // 1为手机验证码登陆，0为微信登陆
const phoneNumber = "156xxxx24"; // 手机号
const concurrencyLimit = 1; // 并发请求限制
const autoNextPage = true; // 自动投递下一页
async function startTask({
  defaultUrl,
  mode,
  phoneNumber,
  concurrencyLimit,
  autoNextPage,
}) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1000 });

  await page.goto("https://www.zhipin.com/");

  const fs = require("fs");
  const oldCookies = !fs.existsSync("cookies.json")
    ? []
    : JSON.parse(fs.readFileSync("cookies.json", "utf8"));
  if (oldCookies?.length >= 1) {
    await page.setCookie(...oldCookies);
    const oldLocalStorageData = JSON.parse(
      fs.readFileSync("localStorageData.json", "utf8")
    );
    for (const [key, value] of Object.entries(oldLocalStorageData)) {
      await page.evaluate(
        (key, value) => {
          window.localStorage.setItem(key, value);
        },
        key,
        value
      );
    }
  } else {
    await page.goto("https://www.zhipin.com/web/user/?ka=header-login", {
      waitUntil: "networkidle0",
    });

    if (mode === 1) {
      await page.type("input[type=tel]", phoneNumber);
      await page.click(".agree-policy");
      await page.click(".btn-sms");

      // 等待用户输入验证码
      console.log("请输入收到的短信验证码：");
      const code = await new Promise((resolve) => {
        process.stdin.once("data", (data) => {
          resolve(data.toString().trim());
        });
      });

      // 填写验证码并点击登录
      await page.type("input[type=text]", code);

      await page.click(".sure-btn");
    } else {
      await page.waitForSelector(".wx-login-icon");
      await page.click(".wx-login-icon");
    }

    await page.waitForNavigation({
      url: "https://www.zhipin.com/web/geek/recommend",
    });

    const cookies = await page.cookies();

    fs.writeFileSync("cookies.json", JSON.stringify(cookies));
    const localStorageData = await page.evaluate(() => {
      const json = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        json[key] = localStorage.getItem(key);
      }
      return json;
    });
    fs.writeFileSync("localStorageData.json", JSON.stringify(localStorageData));
  }

  async function startSendMessage(defaultUrl, autoNextPage) {
    await page.goto(defaultUrl);
    await page.waitForSelector(".job-card-left");
    const jobCards = await page.$$(".job-card-left");
    let successCount = 0;
    let failCount = 0;
    let communicationCount = 0;
    async function processJobCard(jobCard) {
      const href = await page.evaluate(
        (jobCard) => jobCard.getAttribute("href"),
        jobCard
      );
      const newPage = await browser.newPage();
      await newPage.goto("https://www.zhipin.com" + href, {
        waitUntil: "networkidle0",
      });

      try {
        await newPage.waitForSelector("a.btn-startchat");
        const btnText = await newPage.$eval(
          "a.btn-startchat",
          (el) => el.textContent
        );
        // console.log(btnText)
        if (btnText.includes("立即沟通")) {
          await newPage.click("a.btn-startchat");
          await newPage.waitForSelector(".dialog-container", {
            timeout: 10000,
          });
          successCount++;
        } else {
          communicationCount++;
        }
      } catch (error) {
        failCount++;
        console.log("发生错误", error);
      }
      await newPage.close();
    }
    let limit = concurrencyLimit;
    for (let i = 0; i <= jobCards.length / limit; i++) {
      try {
        await Promise.all([
          ...jobCards.slice(i * limit, (i + 1) * limit).map(processJobCard),
          new Promise((resolve) => {
            setTimeout(resolve, 2000);
          }),
        ]);
      } catch (err) {
        console.log("发生错误", error);
      }
    }
    console.log("沟通成功:", successCount);
    console.log("之前已经沟通:", communicationCount);
    console.log("沟通失败:", failCount);
    // await browser.close();
    if (failCount.length >= 5) {
      console.log("错误太多，自动退出");
      return;
    }
    if (autoNextPage) {
      // 获取当前页面的URL
      let url = new URL(defaultUrl);
      // 获取查询参数
      let params = new URLSearchParams(url.search);
      // 设置新的参数值
      params.set(
        "page",
        !params.get("page") ? 2 : parseInt(params.get("page")) + 1
      );
      // 将查询参数设置回URL
      url.search = params.toString();
      const newDefaultUrl = url.href;
      console.log("开始下一页");
      startSendMessage(newDefaultUrl, autoNextPage);
    }
  }
  await startSendMessage(defaultUrl, autoNextPage);
}


startTask({ defaultUrl, phoneNumber, mode, concurrencyLimit, autoNextPage });

