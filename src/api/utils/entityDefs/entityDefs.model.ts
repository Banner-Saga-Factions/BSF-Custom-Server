export class EntityDef {  
    id: number;
    user_fk: number;
    classs: string;    
    unit_id: string; 
    entity_class: string; 
    name: string; 
    appearance_acquires: number; 
    appearance_index: number; 

    public constructor(id: number, user_fk: number, unit_id: string, entity_class: string, name: string, appearance_acquires: number, appearance_index: number) {  
            this.id = id;     
            this.user_fk = user_fk; 
            this.classs = "EntityDef"; 
            this.unit_id = unit_id; 
            this.entity_class = entity_class; 
            this.name = name; 
            this.appearance_acquires = appearance_acquires; 
            this.appearance_index = appearance_index; 
    };  
} 

export class AddEntityDef {  
    user_fk: number;
    classs = "EntityDef";   
    unit_id: string; 
    entity_class: string; 
    name: string; 
    appearance_acquires: number; 
    appearance_index: number; 
    
    public constructor(user_fk: number, unit_id: string, entity_class: string, name: string) {     
            this.user_fk = user_fk; 
            this.unit_id = unit_id; 
            this.entity_class = entity_class; 
            this.name = name; 
            this.appearance_acquires = 0; 
            this.appearance_index = 0; 
    };  
} 