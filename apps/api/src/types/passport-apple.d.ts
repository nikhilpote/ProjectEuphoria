declare module 'passport-apple' {
  import { Strategy as PassportStrategy } from 'passport';
  export interface AppleStrategyOptions {
    clientID: string;
    teamID: string;
    keyID: string;
    privateKeyString?: string;
    privateKeyPath?: string;
    callbackURL: string;
    passReqToCallback?: boolean;
    scope?: string[];
  }
  export class Strategy extends PassportStrategy {
    constructor(options: AppleStrategyOptions, verify: (...args: any[]) => void);
    name: string;
  }
}
