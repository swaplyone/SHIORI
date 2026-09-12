declare module 'cookie-parser' {
  import { RequestHandler } from 'express';
  function cookieParser(secret?: string | string[], options?: cookieParser.CookieParseOptions): RequestHandler;
  namespace cookieParser {
    interface CookieParseOptions {
      decode?(val: string): string;
    }
    function JSONCookie(str: string): object | undefined;
    function JSONCookies<T extends { [key: string]: string }>(jsonCookies: T): { [P in keyof T]: object | undefined };
    function signedCookie(str: string, secret: string | string[]): string | false;
    function signedCookies<T extends { [key: string]: string }>(cookies: T, secret: string | string[]): { [P in keyof T]?: string | false };
  }
  export = cookieParser;
}
