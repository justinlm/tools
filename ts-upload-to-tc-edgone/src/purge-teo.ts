import tencentcloud from "tencentcloud-sdk-nodejs-intl-en";
import { loadAppConfig } from "./utils";
import { AppConfig, COSConfig, EnvironmentConfig } from "./types";

const TeoClient = tencentcloud.teo.v20220901.Client;
const models = tencentcloud.teo.v20220901.Models;

const Credential = tencentcloud.common.Credential;
const ClientProfile = tencentcloud.common.ClientProfile;
const HttpProfile = tencentcloud.common.HttpProfile;

export class PurgeTEO {
    currentDir: string;
    appConfig: AppConfig;
    currentEnvironment: EnvironmentConfig;
    cosConfig: COSConfig;
    constructor() {
        this.currentDir = process.cwd();
        this.appConfig = loadAppConfig();
        const environments = this.appConfig.environments;
        this.currentEnvironment = environments[this.appConfig.currentEnv];
        this.cosConfig = this.appConfig.cosConfig;
    }

    async purgeTask(): Promise<void> {
        return new Promise((resolve, reject) => {
            // 实例化一个认证对象，入参需要传入腾讯云账户 SecretId 和 SecretKey，此处还需注意密钥对的保密
            // 代码泄露可能会导致 SecretId 和 SecretKey 泄露，并威胁账号下所有资源的安全性
            // 密钥可前往官网控制台 https://console.tencentcloud.com/capi 进行获取
            let cred = new Credential(this.cosConfig.secretId, this.cosConfig.secretKey);
            // 实例化一个http选项，可选的，没有特殊需求可以跳过
            let httpProfile = new HttpProfile();
            httpProfile.endpoint = "teo.tencentcloudapi.com";
            // 实例化一个client选项，可选的，没有特殊需求可以跳过
            let clientProfile = new ClientProfile();
            clientProfile.httpProfile = httpProfile;

            // 实例化要请求产品的client对象,clientProfile是可选的
            let client = new TeoClient(cred, this.cosConfig.region, clientProfile);

            // 实例化一个请求对象,每个接口都会对应一个request对象
            let req = new models.CreatePurgeTaskRequest();

            let params = {
                "ZoneId": this.currentEnvironment.zoneId,
                "Type": "purge_prefix",
                "Method": "invalidate",
                "Targets": [
                    this.currentEnvironment.cdnUrl + this.currentEnvironment.prefix + "/"
                ]
            };
            req.from_json_string(JSON.stringify(params))

            // 返回的resp是一个CreatePurgeTaskResponse的实例，与请求对象对应
            client.CreatePurgeTask(req, (err: any, response: any) => {
                if (err) {
                    // console.error("TEO 缓存刷新失败:", err);
                    reject(err);
                    return;
                }
                // console.log("TEO 缓存刷新成功");
                console.log(response.to_json_string());
                resolve();
            });
        });
    }
}

// 直接启动交互式工具
const purgeTEO = new PurgeTEO();
purgeTEO.purgeTask();