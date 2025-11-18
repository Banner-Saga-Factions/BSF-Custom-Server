import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

export type AccountRecord = {
    user_id: number;
    username: string;
    steam_id?: string;
};

const DATA_ROOT = resolve("./data");
const ACCOUNT_TEMPLATE_PATH = join(DATA_ROOT, "acc.json");
const ACCOUNT_INDEX_PATH = join(DATA_ROOT, "accounts.json");
const USER_DATA_DIR = join(DATA_ROOT, "users");

const readJson = <T>(filePath: string): T => JSON.parse(readFileSync(filePath, "utf-8"));

const ensureDir = (dir: string) => {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
};

let accountRecords: AccountRecord[] | null = null;
const getAccountRecords = (): AccountRecord[] => {
    if (!accountRecords) {
        accountRecords = readJson<AccountRecord[]>(ACCOUNT_INDEX_PATH);
    }
    return accountRecords;
};

export const refreshAccountRecords = () => {
    accountRecords = null;
};

export const listAccountRecords = (): AccountRecord[] => {
    return [...getAccountRecords()];
};

export const getAccountRecordById = (userId: number): AccountRecord | undefined => {
    return getAccountRecords().find((record) => record.user_id === userId);
};

export const getAccountRecordByUsername = (username: string): AccountRecord | undefined => {
    const normalized = username?.trim().toLowerCase();
    return getAccountRecords().find((record) => record.username.toLowerCase() === normalized);
};

export const getAccountRecordBySteamId = (steamId: string): AccountRecord | undefined => {
    const normalized = steamId?.trim();
    return getAccountRecords().find(
        (record) => record.steam_id === normalized || String(record.user_id) === normalized
    );
};

const getUserDataPath = (userId: number) => {
    ensureDir(USER_DATA_DIR);
    return join(USER_DATA_DIR, `${userId}.json`);
};

const ensureUserData = (userId: number): string => {
    const filePath = getUserDataPath(userId);
    if (!existsSync(filePath)) {
        const template = readJson<any>(ACCOUNT_TEMPLATE_PATH);
        writeFileSync(filePath, JSON.stringify(template, null, 2), "utf-8");
    }
    return filePath;
};

export type AccountData = any;

export const getAccountData = (userId: number): AccountData => {
    const filePath = ensureUserData(userId);
    return readJson<AccountData>(filePath);
};

export const saveAccountData = (userId: number, data: AccountData) => {
    const filePath = getUserDataPath(userId);
    ensureDir(USER_DATA_DIR);
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
};

const extractPartyIds = (account: AccountData): string[] => {
    const ids = account?.party?.ids;
    return Array.isArray(ids) ? ids : [];
};

const extractRosterDefs = (account: AccountData): any[] => {
    const defs = account?.roster?.defs;
    return Array.isArray(defs) ? defs : [];
};

const getPartyDefsFromAccount = (account: AccountData, partyIds: string[]): any[] => {
    const roster = extractRosterDefs(account);
    if (!roster.length) {
        return [];
    }
    if (!partyIds.length) {
        return roster.slice(0, 6);
    }
    const partySet = new Set(partyIds);
    const defs = roster.filter((unit) => partySet.has(unit.id));
    return defs.length ? defs : roster.slice(0, 6);
};

const computePowerFromDefs = (defs: any[]): number => {
    return defs.reduce((power, unit) => {
        const stats = Array.isArray(unit?.stats) ? unit.stats : [];
        const rank = stats.find((stat: any) => stat.stat === "RANK");
        const value = typeof rank?.value === "number" ? rank.value : 1;
        return power + Math.max(value - 1, 0);
    }, 0);
};

export type PartyInfo = {
    account: AccountData;
    partyIds: string[];
    partyDefs: any[];
    power: number;
};

export const getPartyInfo = (userId: number): PartyInfo => {
    const account = getAccountData(userId);
    const partyIds = extractPartyIds(account);
    const partyDefs = getPartyDefsFromAccount(account, partyIds);
    const effectivePartyIds = partyIds.length ? partyIds : partyDefs.map((unit) => unit.id);
    return {
        account,
        partyIds: effectivePartyIds,
        partyDefs,
        power: computePowerFromDefs(partyDefs),
    };
};
