export class User {  
    id: number;  
    username: string;  
    password: string;
    steam_id: string;
    completed_tutorial: number;
    daily_login_bonus: number;
    daily_login_streak: number;
    iap_sandbox: boolean;
    login_count: number;
    renown: number;
    roster_rows: number;
    
    constructor(id: number, username: string, password: string, steam_id: string, completed_tutorial: number,
        daily_login_bonus: number, daily_login_streak: number, iap_sandbox: boolean, login_count: number, renown: number, roster_rows: number) {  
            this.id = id;  
            this.username = username;  
            this.password = password;  
            this.steam_id = steam_id;
            this.completed_tutorial = completed_tutorial;
            this.daily_login_bonus = daily_login_bonus;
            this.daily_login_streak = daily_login_streak;
            this.iap_sandbox = iap_sandbox;
            this.login_count = login_count;
            this.renown = renown;
            this.roster_rows = roster_rows;
    }  
}  

export class Party {  
    user_fk: number;
    unit_id: string;    
  
    constructor(user_fk: number, unit_id: string) {  
            this.user_fk = user_fk;
            this.unit_id = unit_id; 
    }  
}  

export class Roster {  
    id: number;
    user_fk: number;
    classs: string;    
    unit_id: string; 
    entity_class: string; 
    name: string; 
    appearance_acquires: number; 
    appearance_index: number; 

    public constructor(id: number, user_fk: number, classs: string, unit_id: string, entity_class: string, name: string, appearance_acquires: number, appearance_index: number) {  
            this.id = id;     
            this.user_fk = user_fk; 
            this.classs = classs; 
            this.unit_id = unit_id; 
            this.entity_class = entity_class; 
            this.name = name; 
            this.appearance_acquires = appearance_acquires; 
            this.appearance_index = appearance_index; 
    };  
} 

export class AddRoster {  
    user_fk: number;
    class_fk: number;    
    unit_id: string; 
    entity_class: string; 
    name: string; 
    appearance_acquires: number; 
    appearance_index: number; 
    
    public constructor(user_fk: number, class_fk: number, unit_id: string, entity_class: string, name: string) {     
            this.user_fk = user_fk; 
            this.class_fk = class_fk; 
            this.unit_id = unit_id; 
            this.entity_class = entity_class; 
            this.name = name; 
            this.appearance_acquires = 0; 
            this.appearance_index = 0; 
    };  
} 

export class RosterStat {  
    roster_fk: number;    
    classs: string; 
    stat: string; 
    value: number;

    constructor(roster_fk: number, classs: string, stat: string, value: number) {  
            this.roster_fk = roster_fk; 
            this.classs = classs; 
            this.stat = stat; 
            this.value = value;
    }  
} 

export class UpdateRosterStat {  
    roster_fk: number;    
    stat_fk: number; 
    value: number;

    constructor(roster_fk: number, stat_fk: number, value: number) {  
            this.roster_fk = roster_fk; 
            this.stat_fk = stat_fk; 
            this.value = value;
    }  
} 