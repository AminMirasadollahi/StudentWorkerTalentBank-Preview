// Presentation only: never guess a name or change selection identity.
export function managerIdentityLabel(name,id){
 const n=typeof name==='string'?name.trim():''
 if(n)return n
 const key=typeof id==='string'?id.trim():''
 return key?'نام ثبت نشده · شناسه '+key:'نام و شناسه در دسترس نیست'
}
