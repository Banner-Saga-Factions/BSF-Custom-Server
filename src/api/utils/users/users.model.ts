export class User {  
    id: number;  
    username: string;  
    password: string;
    discord_id: string;
    completed_tutorial: number;
    daily_login_bonus: number;
    daily_login_streak: number;
    iap_sandbox: boolean;
    login_count: number;
    renown: number;
    roster_rows: number;
    
    constructor(id: number, username: string, password: string, discord_id: string, completed_tutorial: number,
        daily_login_bonus: number, daily_login_streak: number, iap_sandbox: boolean, login_count: number, renown: number, roster_rows: number) {  
            this.id = id;  
            this.username = username;  
            this.password = password;  
            this.discord_id = discord_id;
            this.completed_tutorial = completed_tutorial;
            this.daily_login_bonus = daily_login_bonus;
            this.daily_login_streak = daily_login_streak;
            this.iap_sandbox = iap_sandbox;
            this.login_count = login_count;
            this.renown = renown;
            this.roster_rows = roster_rows;
    }  
} 