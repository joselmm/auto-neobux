import fetch from "node-fetch";


const ONE_DAY = 24 * 60 * 60 * 1000; // 86400000 ms
export async function compareTime(ts) {
    
    if (ts - Date.now() < ONE_DAY) {
        return {
            noError: false,
            message: "aun no a pasado al menos 24hr con "+username
        }
    }
    return {
        noError:true
    }
}

export async function getContextIp() {
    var res = await fetch("https://api.ipify.org?format=json")
    var ipJson = await res.json()
    //console.log(ipJson.ip)
    return ipJson.ip
}

