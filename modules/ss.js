import fetch from "node-fetch";
import { compareTime, getContextIp } from "./utils.js";


export async function getUserNameList() {
    var listRes = await fetch(process.env.AS_LIBRARY+"?spreadSheetId="+process.env.SS_ID+"&sheetIdType=name&sheetId=list");
    var listJson = await listRes.json()

    if(listJson.noError===false) throw new Error(listJson.errorMessage)
    
    return listJson.data
}

export async function analizeList(list) {
    var contextIp = await getContextIp();
    var foundByIp = list.filter(e=>e.last_ip===contextIp);

    for (let i = 0; i < list.length; i++) {
        const user = list[i];
        compareTime(user)
    }
}

getUserNameList()