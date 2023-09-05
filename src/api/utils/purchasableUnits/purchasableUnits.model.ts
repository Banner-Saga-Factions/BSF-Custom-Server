export class PurchasableUnit {  
    id: number;  
    pu_class: string;  
    def_class: string;
    def_id: string;
    def_entity_class: string;
    def_auto_level: number;
    def_start_date: number;
    def_appearance_acquires: number;
    def_appearance_index: number;
    limit: number;
    cost: number;
    comment: string;
    
    constructor(id: number, pu_class: string, def_class: string, def_id: string, def_entity_class: string,
        def_auto_level: number, def_start_date: number, def_appearance_acquires: number, def_appearance_index: number, limit: number, cost: number, comment: string) {  
            this.id = id;  
            this.pu_class = pu_class;  
            this.def_class = def_class;  
            this.def_id = def_id;
            this.def_entity_class = def_entity_class;
            this.def_auto_level = def_auto_level;
            this.def_start_date = def_start_date;
            this.def_appearance_acquires = def_appearance_acquires;
            this.def_appearance_index = def_appearance_index;
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