declare module 'tencentcloud-sdk-nodejs-intl-en' {
  interface Credential {
    new (secretId: string, secretKey: string): any;
  }

  interface HttpProfile {
    endpoint?: string;
    reqTimeout?: number;
    reqMethod?: string;
  }

  interface ClientProfile {
    httpProfile?: HttpProfile;
    signMethod?: string;
  }

  interface TeoModels {
    CreatePurgeTaskRequest: new () => any;
    CreatePurgeTaskResponse: new () => any;
  }

  interface TeoV20220901 {
    Client: new (credential: any, region: string, clientProfile?: ClientProfile) => any;
    Models: TeoModels;
  }

  interface Teo {
    v20220901: TeoV20220901;
  }

  interface Common {
    Credential: Credential;
    ClientProfile: new () => ClientProfile;
    HttpProfile: new () => HttpProfile;
  }

  interface TencentCloud {
    teo: Teo;
    common: Common;
  }

  const tencentcloud: TencentCloud;
  export default tencentcloud;
}