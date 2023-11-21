export class Party {  
    user_fk: number;
    unit_id: string;    
  
    constructor(user_fk: number, unit_id: string) {  
            this.user_fk = user_fk;
            this.unit_id = unit_id; 
    }  
} 