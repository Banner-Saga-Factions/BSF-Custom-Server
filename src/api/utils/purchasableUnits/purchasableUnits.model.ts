export class PurchasableUnit {  
    id: number;  
    pu_class: string;  
    entitydef_fk: number;
    auto_level: number;
    limit: number;
    cost: number;
    comment: string;
    
    constructor(id: number, entitydef_fk: number,
        auto_level: number, limit: number, cost: number, comment: string) {  
            this.id = id;  
            this.pu_class = "PurchasableUnitData"; 
            this.entitydef_fk = entitydef_fk;
            this.auto_level = auto_level;
            this.limit = limit;
            this.cost = cost;
            this.comment = comment;
    }  
}  

export class PurchasableUnitStat {  
    purchasable_unit_fk: number;    
    classs: string; 
    stat: string; 
    value: number;

    constructor(purchasable_unit_fk: number, classs: string, stat: string, value: number) {  
            this.purchasable_unit_fk = purchasable_unit_fk; 
            this.classs = classs; 
            this.stat = stat; 
            this.value = value;
    }  
} 

export class PurchasableUnitStatRaw {  
    purchasable_unit_fk: number;    
    class_fk: number; 
    stat_fk: number; 
    value: number;

    constructor(purchasable_unit_fk: number, class_fk: number, stat_fk: number, value: number) {  
            this.purchasable_unit_fk = purchasable_unit_fk; 
            this.class_fk = class_fk; 
            this.stat_fk = stat_fk; 
            this.value = value;
    }  
} 