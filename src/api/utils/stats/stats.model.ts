export class Stat {  
    id: number;    
    stat: string; 

    constructor(id: number, stat: string) {  
            this.id = id; 
            this.stat = stat; 
    }  
} 

export class DefStat {  
    entitydef_fk: number;    
    classs: string; 
    stats_fk: number; 
    value: number;

    constructor(entitydef_fk: number, stats_fk: number, value: number) {  
            this.entitydef_fk = entitydef_fk; 
            this.classs = "tbs.srv.data.Stat"; 
            this.stats_fk = stats_fk; 
            this.value = value;
    }  
} 

export class UpdateDefStat {  
    entitydef_fk: number;    
    stats_fk: number; 
    value: number;

    constructor(entitydef_fk: number, stats_fk: number, value: number) {  
            this.entitydef_fk = entitydef_fk; 
            this.stats_fk = stats_fk; 
            this.value = value;
    }  
} 