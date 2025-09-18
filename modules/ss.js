import fetch from "node-fetch";
import { compareTime, getContextIp } from "./utils.js";


export async function getUserNameList() {
    var listRes = await fetch(process.env.AS_LIBRARY + "?spreadSheetId=" + process.env.SS_ID + "&sheetIdType=name&sheetId=list");
    var listJson = await listRes.json()

    if (listJson.noError === false) throw new Error(listJson.errorMessage)

    return listJson.data
}

export async function analizeList(list) {
    var contextIp = await getContextIp();
    var foundByIp = list.filter(e => e.last_ip === contextIp);

    for (let i = 0; i < list.length; i++) {
        const user = list[i];
        compareTime(user)
    }
}


export async function updateRow(row) {

    
    var asResponse = await fetch(process.env.AS_LIBRARY, {
        method: "POST",
        body: JSON.stringify({
            "queryParameters": {
                "spreadSheetId": process.env.SS_ID,
                "sheetId": "list",
                "sheetIdType": "name"
            },
            "action": "UPDATE_IF",
            "condition": "@username@ == ROW_OBJECT['username']",
            "payload": [row]
        })
    });

    if(!asResponse.ok){
        throw new Error("El servidor lanzo un codigo http "+asResponse.status)
    }

    var json =  await asResponse.json();
    if(json.noError===false){
        throw new Error("La libreria devolvio un error "+json.message)
    }

    

    return json.data

}