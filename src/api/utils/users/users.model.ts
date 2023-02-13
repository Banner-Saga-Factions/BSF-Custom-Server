export class User {  
    id: number;  
    username: string;  
    password: string;
    steam_id: string;
  
    constructor(id: number, username: string, password: string, steam_id: string) {  
            this.id = id;  
            this.username = username;  
            this.password = password;  
            this.steam_id = steam_id;  
    }  
}  