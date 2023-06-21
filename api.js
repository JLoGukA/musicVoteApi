const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const mysqlpromise = require('mysql2/promise')
const fs =require('fs')
const formidable = require('formidable');
const axios=require('axios');
const { exec } = require("child_process");
const app = express(); 
const buffer=require("buffer")
app.use(cors());
app.use(express.json());
const cron=require("node-cron")
const wsapp = require('ws')
const expressws = require('express-ws')(app)

const con = mysql.createConnection({
    host: 'localhost',
    port: "3306",
    user: "groot",
    password: "0000",  
    database:"sq"
});

//var onUpload=""

//_________РАСПИСАНИЕ_________//

//Получение информации о всех файлах на всех устройствах, где имеются файлы с расширением .wav или .mp3
app.get('/schedule/getFileInfo',async(req, res) => {

    con.query("select id,file from sq.devices having right(file,3)=\"wav\" or right(file,3)=\"mp3\";",(err,result,fields)=>{

        let table=[]

        for(let i=0; i<result.length; i++){
            table.push([])
            table[i].push(result[i].id)
            table[i].push(result[i].file)
        }
        res.send(table)
    })

})
//Функция получения полной таблицы расписания 
app.get('/schedule/get',async(req, res) => {
    
    con.query("select row_num as Номер,device as устройство,unix_timestamp(date) as дата,file as файл,place as место,comment as комментарий from sq.schedule",(err,result,fields)=>{
        let table=[[]]
        
        for(let i=0; i<fields.length; i++){
            table[0].push(fields[i].name)
        }
        for(let i=1; i<result.length+1; i++){
            table.push([])
            table[i].push(result[i-1].Номер)
            table[i].push(result[i-1].устройство)
            
            let int =parseInt(result[i-1].дата)*1000
            let date1

            if(isNaN(int)) {
                date1=new Date(Date.now())
                int=date1.getTime()
            }
            else date1=new Date(int)
            offset1 = date1.getTimezoneOffset()
            date1=new Date(int-offset1*60000)

            table[i].push(date1)
            
            table[i].push(result[i-1].файл)
            table[i].push(result[i-1].место)
            table[i].push(result[i-1].комментарий)
        }
        res.send(table)
    })
})

app.get('/schedule/edit',async(req, res) => {

    if(req.headers.edit==='0'){//Изменение
        let decid = decodeURI(req.headers.id)
        let deccol = decodeURI(req.headers.col)
        let decval = decodeURI(req.headers.val)

        let dict={
            Номер:"row_num",
            устройство:"device",
            файл:"file",
            место:"place",
            комментарий:"comment"
        }
        
        deccol=deccol.toLowerCase()
        if(deccol==="дата"){
            decval = "from_unixtime("+(Date.parse(decval))+"/1000)"
            deccol = "date"
        }
        else {
            deccol=dict[deccol]
            decval = "\""+decval+"\""
        }

        con.query("update sq.schedule set "+deccol+"="+decval+
        " where row_num="+decid+";",
        (err,result,field)=>{
            if(err){
                res.sendStatus(406)
            }
            else {
                res.sendStatus(200)   
            }
        })
        updateDeviceSchedule(decid)
    }
    else if(req.headers.edit==="1"){//Удаление

        let decid = decodeURI(req.headers.id)

        con.query("delete from sq.schedule where row_num="+decid,(err,result,field)=>{
            if(err){
                res.sendStatus(406)
                return;
            }
            else{
                res.sendStatus(200)
            }
            
        })
        updateDeviceSchedule(decid)
    }
    else if(req.headers.edit==="2"){//Добавление
        con.query("insert sq.schedule() values()",(err,result,field)=>{
            if(err){
                res.sendStatus(406)
            }
            else res.sendStatus(200)
        })
    }
})

//_________УСТРОЙСТВО_________//

//проверить онлайн ли каждое устройство, которое записано в бд
async function checkOnline(){
    let queryIp=(await con.promise().query("select distinct id,ip from sq.devices"))
    let alive=[]
    
    for(let i=0;i<queryIp[0].length;i++){
        let str=queryIp[0][i].ip
        await axios.get("http://"+str+":80/isAlive").then((res)=>{if(res.data=="Alive")alive.push(queryIp[0][i].id)/*res.data should be "Alive"*/ }).catch((error)=>{
            con.query("delete from sq.devices where id ="+queryIp[0][i].id,(err, result, fields) => {});
        })
    }
    return alive
    
}
//setInterval(checkOnline,180000)

//Устройство отправляет информацию на сервер, потом сервер отправляет устройству расписание
app.post('/device/sendInfo', async (req, res) => {

    con.query("delete from sq.devices where id="+req.body.ID,(err,result,fields)=>{});
    console.log(req.body.files)
    for(let i=0; i<req.body.files.length; i++){
        con.query("insert sq.devices(id,ip,file) values(" +
                    req.body.ID +",\"" +
                    req.body.IP +"\",\"" +
                    req.body.files[i] +"\")"
                    ,(err, result, fields) => {if(err)console.log(err)})
    }
    con.query("delete from sq.device_online where device_id="+req.body.ID)
    con.query("insert sq.device_online(device_id,online,playing) values("+req.body.ID+",1,\"\")")
    
    
    con.query("delete from sq.device_settings where device_id="+req.body.ID,(err,result,fields)=>{})
    con.query(
        "insert sq.device_settings values ("+
        req.body.ID +",\"" +
        req.body.volume +"\"," +
        req.body.LRC +","+
        req.body.BCLK +","+
        req.body.DOUT +
        ",\"\",\"\",\""+req.body.serverIP +"\","+//еще и ssid, password
        req.body.serverPort +",\""+
        req.body.apName +"\",\""+
        req.body.apPass +"\",\"" +
        req.body.ntpServer +"\"," +
        req.body.ntpAddTime+");"
    )
    res.sendStatus(200)
    
    con.query("select DATE_FORMAT(date, '%m/%d/%Y/%H/%i') as date,file from sq.schedule where device="+req.body.ID,async(err,result,fields)=>{
        let ans = {
            date: [],
            file: []
        };
        for(var i=0;i<result.length;i++){
            ans['date'].push(result[i].date)
            ans['file'].push(result[i].file)
        }
        await axios.post("http://"+req.body.IP+":80/setSchedule", ans, {
            headers: {
                'Content-Type': 'application/json'
            }
        }).then((res)=>{console.log("SENDINFO "+res.status)}).catch((err)=>{});
    })
});

//Проигрывание или остановка музыки на устройстве
//Когда устройство закончило проигрывать, оно отправляет заголовок "stop"
//Если заголовок "file"=="stop", сервер запрашивает устройство остановить проигрыш
app.get('/device/playNow',async(req, ress) => {
    //deviceIP,filename,repeat times I=infinite
    if(req.headers.ip!==undefined){
        let decid = decodeURI(req.headers.id)
        let decip = decodeURI(req.headers.ip)
        let decfile = decodeURI(req.headers.file)
        if(decfile!=="STOP")con.query("update sq.device_online set playing=\""+decfile+"\" where device_id="+decid,(err,result,fields)=>{})
        await axios.get("http://"+decip+":80/playNow",{headers:{
            file:decfile
        }}).then((res)=>{
            if(res.data==="stop"){
                con.query("update sq.device_online set playing=\"\" where device_id="+decid,(err,result,fields)=>{})
            }
            ress.send(res.data)
            
        }).catch((err)=>{
            if(err){
                ress.send(err.code)
            }
        })
    }
    else if(req.headers.stop!==undefined){
        if(req.headers.stop==="stop"){
            con.query("update sq.device_online set playing=\"\" where device_id="+req.headers.id,(err,result,fields)=>{})
        }
        ress.sendStatus(200);
    }
    else{
        ress.sendStatus(400)
    }
})

//Устройство отправляет сюда кастомные сообщения под заголовком "message"
//Полезно для дебага по интернету
app.get('/device/sendCustomMessage',async(req, res) => {
    if(req.headers.message!==undefined){
        console.log(req.headers.message)
        res.sendStatus(200)
        
    }
    else{
      res.sendStatus(400)  
    }
})

//Запрос у устройства текущего проигрываемого трека
app.get('/device/whatPlaying',async(req, ress) => {
    if(req.headers.ip!==undefined){
        await axios.get("http://"+req.headers.ip+":80/whatPlaying").then((res)=>{
        ress.send(res.data)
        }).catch((err)=>{if(err)ress.send(err.data)})
    }
    else ress.sendStatus(400);
})

//Обновить расписание устройства, где rowid это номер строки в таблице расписания
async function updateDeviceSchedule (rowid){
    let queryDevice=(await con.promise().query("select distinct id,ip from sq.devices where id=(select distinct device from sq.schedule where row_num="+rowid+")"))
    if(queryDevice[0].length>0){
        con.query("select DATE_FORMAT(date, '%m/%d/%Y/%H/%i') as date,file from schedule where device="+queryDevice[0][0].id+" order by date",async(err,resultd,fields)=>{
            let ans = {
                date: [],
                file: []
            };
            for(var i=0;i<resultd.length;i++){
                ans['date'].push(resultd[i].date)
                ans['file'].push(resultd[i].file)
            }
            
            await axios.post("http://"+queryDevice[0][0].ip+":80/setSchedule", ans, {
                headers: {
                    'contentType': 'application/json'
                }
            }).then((res)=>{console.log("SENDINFO "+res.status)}).catch((err)=>{});
        })
    }
    
}


//загрузка файла с сервера на устройство
app.post('/device/fileUpload',async(req, ress) => {
    let options={
        maxFileSize:25* 1024 * 1024 //20MB
    }
    const form = new formidable.IncomingForm(options);
    form.parse(req, async (err, fields, files) => {
        if(err){
            console.log(err)
            ress.send(500)
            return
        }
        let fp = decodeURI(files.file.filepath)
        let fileName = decodeURI(fields.fileName)
        let saveDir = decodeURI(fields.saveDir)
        let raw = fs.readFileSync(fp)

        //fields.saveDir - directory to save on device      
        fs.writeFile("filesToUpload/"+fileName, raw,(err)=>{
        })
        //onUpload="filesToUpload\\"+fileName
        let fileDir=saveDir
        if(!fileDir)fileDir='/'
        if(fileDir[0]!=='/')fileDir='/'+fileDir
        if(fileDir[fileDir.length-1]!=='/')fileDir+='/'
        let config = {
            headers: {
                'file': String(fileDir+fileName),
                'dir':String(fileDir),
                'Content-Type': 'multipart/form-data'
            }
        }
        
        await axios.post("http://"+fields.ip+":80/upload",{raw},config).then((res)=>{ress.sendStatus(res.status)}).catch((error)=>{})
    });
})

//загрузка файла с устройства, сохранение на сервере и потом отправка клиенту
app.get('/device/fileDownload',async(req, ress) => {
    const options={
        root:__dirname
    }
    if(req.headers===undefined)ress.sendStatus(404);

    if(req.headers.gen!==undefined){
        let decname =decodeURI(req.headers.filename)
        let path = "genAudio/"+decname
        ress.sendFile(path,options,(err)=>{})
    }
    else{
        let writer=fs.createWriteStream("filesToUpload/"+req.headers.filename,{highWaterMark: Math.pow(2,16)})
        writer.on('close',()=>{
            ress.sendFile("filesToUpload/"+req.headers.filename,options)
        })
        await axios({
            url:"http://"+req.headers.ip+":80/download",
            method:'GET',
            responseType:'stream',
            headers:{
                'file': req.headers.file,
            }
        }).then((res)=>{
            res.data.pipe(writer)
            
        }).catch((error)=>{})
    }
    
})

//Удаление файла с устройства
app.post('/device/fileDelete',async(req, ress) => {
    if(req.headers.gen!==undefined){
        let decname = decodeURI(req.headers.filename)
        await fs.promises.unlink(__dirname+"/genAudio/"+decname)
        ress.sendStatus(200)
    }
    else{
        await axios({
            url:"http://"+req.headers.ip+":80/delete",
            method:'GET',
            headers:{
                'dir': req.headers.dir,
            }
        }).then((res)=>{
    
        }).catch((error)=>{}).then(async()=>{
            await axios.get("http://"+req.headers.ip+":80/getResources").then((res)=>{
                ress.sendStatus(res.status)
            })
        })
    }
})

//Обновление конфиг файла на устройстве
app.get('/device/updateConfig', async (req, res) => {
    if(req.headers.value!==undefined){
        await axios({
            url:"http://"+req.headers.ip+":80/updateConfig",
            method:"GET",
            headers:{
                "param":req.headers.param,
                "value":decodeURI(req.headers.value)
            }
        }).then((resp)=>{
            res.sendStatus(resp.status)
        }).catch((err)=>{})
    }
    else res.sendStatus(400)
})

//Получение конфиг файла и всей информации об устройствах
app.get('/device/info', async (req, res) => {
    
    var deviceInfo=[]
    var deviceFile=[]
    var deviceConfig=[]
    
    //let queryInfo = (await con.promise().query("select distinct id,ip,count(file) as cnt,playing from st.devices group by id,ip,playing").catch((err)=>{return}))
    // let queryInfo = (await con.promise().query(
    // "select distinct id,ip,count(file) as cnt,playing from sq.devices join sq.device_online on device_online.device_id=devices.id join sq.device_settings on sq.device_settings.device_id=sq.devices.id group by id,ip,playing"
    // ).catch((err)=>{return}))
    let queryInfo = (await con.promise().query(
    "select distinct id,ip,count(file) as cnt,playing,sq.device_settings.* from sq.devices " +
    "join sq.device_online on device_online.device_id=devices.id "+
    "join sq.device_settings on sq.device_settings.device_id=sq.devices.id group by id,ip,playing"
    ).catch((err)=>{return}))
    
    let queryFile=(await con.promise().query("select file from sq.devices").catch((err)=>{return}))
    
    for(let i in queryInfo[0]){
        deviceInfo.push([queryInfo[0][i].id,queryInfo[0][i].ip,queryInfo[0][i].cnt,queryInfo[0][i].playing])
    }
    for(let i in queryInfo[0]){
        deviceConfig.push([queryInfo[0][i].id,queryInfo[0][i].volume,queryInfo[0][i].LRC,queryInfo[0][i].BCLK,
                            queryInfo[0][i].DOUT, queryInfo[0][i].ssid,queryInfo[0][i].password,queryInfo[0][i].server_ip,
                            queryInfo[0][i].server_port,queryInfo[0][i].ap_name,queryInfo[0][i].ap_pass,queryInfo[0][i].ntpServer,
                            queryInfo[0][i].ntpAddTime
                        ])
    }
    let k=0
    for(let i=0; i<deviceInfo.length;i++){
        deviceFile.push([])
        for(let j=0+k;j<deviceInfo[i][2]+k;j++){
            deviceFile[i].push(queryFile[0][j].file)
        }
        k+=deviceInfo[i][2]
    }

    res.send({deviceInfo,deviceFile,deviceConfig})

});

//отправка команды перезагрузки устройству
//Перезагрузка будет осуществлена только если имеется заголовок "by":"server"
app.get('/device/restart', async (req, res) => {
    if(req.headers.ip!==undefined){
        await axios({
            url:"http://"+req.headers.ip+":80/restart",
            method:"GET",
            headers:{"by":"server"}
        }).then((resp)=>{
            res.sendStatus(resp.status)
        }).catch((err)=>{})
    }
    else res.sendStatus(400)
})



//_________СЕРВЕР_________//

//Стандартный ответ сервера
app.get('/', (req, res) => {
    res.sendStatus(200)
});

//Запрос у сервера генерации аудио
app.get('/file/generate',async(req, ress) => {
    
    let path = __dirname+"/genAudio"

    if(req.headers.file!==undefined){
        let decname = decodeURI(req.headers.file)
        let dectext = decodeURI(req.headers.text)
        exec("echo \""+dectext+"\" | RHVoice-test -o \"/$home/gen/"+decname+"\" -p aleksandr-hq",(error,stdout,stderr)=>{
            if(error)console.log(error)
            if(stderr)console.log(stderr)
        })
        
    }

    let files=fs.readdirSync(path)
    ress.send(files)
})

//Проверка логина и пароля запросом
app.post('/user/login', (req, res) => {

    con.query(
    "select if(\"" +
    req.body.pass +
    "\" in (select password from sq.users where \"" +
    req.body.login + 
    "\" in(select login from users)),1,0) as Pass;",
    (err, result, fields) => {
        if(err){
            console.log(err)
            return
        }
        res.send(""+result[0].Pass)
    })

});

//_________ГОЛОСОВАНИЕ_________//

//

app.get('/polls/info',async (request,response)=>{
    const conn = await mysqlpromise.createConnection({
        host: 'localhost',
        port: "3306",
        user: "root",
        password: "0000",  
        database:"sq"
    })
    const [rows,fields] = request.headers.poll==undefined ?
    await conn.execute(
        "select poll.poll_id as poll_id,poll_name,unix_timestamp(date_begin) as date_begin,unix_timestamp(date_end) as date_end,row_name,votes,device_id,file,poll_info.id as infoid,poll_device.id as devid "+
        "from poll join poll_device on poll_device.poll_id=poll.poll_id "
        +"join poll_info on poll.poll_id=poll_info.poll_id order by poll.poll_id,row_name;")
        .catch((err)=>{if(err)console.log(err)})
    :
    await conn.execute(
        "select poll.poll_id as poll_id,poll_name,unix_timestamp(date_begin) as date_begin,unix_timestamp(date_end) as date_end,row_name,votes "+
        "from poll join poll_info on poll.poll_id=poll_info.poll_id order by poll.poll_id,row_name")
        .catch((err)=>{if(err)console.log(err)})  

    const [rowsFile,fieldsFile]= request.headers.poll==undefined ?
    await conn.execute("select poll_id,file from devices join poll_device on devices.id=poll_device.device_id having right(file,3)=\"wav\" or right(file,3)=\"mp3\" order by poll_id;")
    :
    await conn.execute("select poll_id,sum(votes) as votes from poll_info group by poll_id order by poll_id")

    let fieldsClear=[]
    for(let i=0; i<fields.length;i++){
        fieldsClear.push(fields[i].name)
    }
    let int,int2,date1,date2
    for(let i=0; i<rows.length;i++){
        int =parseInt(rows[i].date_begin)*1000
        int2 =parseInt(rows[i].date_end)*1000
        if(isNaN(int)) {
            date1=new Date(Date.now()); date2=date1
            int=date1.getTime(); int2=int
        }
        else {
            date1=new Date(int)
            date2=new Date(int2)
        }
        offset = date1.getTimezoneOffset()
        date1=new Date(int-offset*60000);
        date2=new Date(int2-offset*60000)
        rows[i].date_begin=date1
        rows[i].date_end=date2
    }
    response.status(200).send({rows,rowsFile})
    conn.end()
})

async function downloadFileFromDevice(ip,file){
    let writer=fs.createWriteStream("filesToUpload/"+file,{highWaterMark: Math.pow(2,16)})       
    axios({
        url:"http://"+ip+":80/download",
        method:'GET',
        responseType:'stream',
        headers:{
            'file': file,
        }
    }).then((res)=>{
        res.data.pipe(writer)
    }).catch((error)=>{})
}

async function uploadFileToDevice(pathfrom,pathto,filename,ip){
    let raw = fs.readFileSync(pathfrom)
    
    let config = {
        headers: {
            'file': String(pathto+filename),
            'dir':String(pathto),
            'Content-Type': 'multipart/form-data'
        }
    }
        
    await axios.post("http://"+ip+":80/upload",{raw},config).then((res)=>{
        if(res.status==="OK")return 1
        else return 0
    }).catch((error)=>{
        if(error)return 0
    })
    
}

async function checkFileOnDevice(ip,file){
    //Проверка наличия определенного файла file на устройстве с адресом ip
    //Возврат 0 - файл не найден ни на каких устройствах или ошибка, 1 - файл найден на целевом устройстве, 2 - файл найден на опрошенных устройствах и загружен на целевое
    
    let res = await con.promise().query("select if(exists (select ip from devices where file=\""+file+"\" and ip=\""+ip+"\"), 1, 0) as ans;")
    if(res[0][0].ans=="1"){
        return 1
    }
    else {
        let res2 = await con.promise().query("select ip from devices where file=\""+file+"\"")
        if(res2[0].length>0&&res2[0][0].ip){
            downloadFileFromDevice(res2[0][0].ip,file)
            if(uploadFileToDevice("filesToUpload"+file,"/music/", file.slice(1,file.length),ip)===1){
                return 2
            }
            else return 0
        }
        else return 0
        
    }
}

async function playOnDevice(ip,file,override){
    for(let i=0; i<dev[0].length;i++){
        axios.get("http://"+decip+":80/playNow",{headers:{
            "file":file
        }}).then((res)=>{
            if(res.data==="stop"){
                con.query("update sq.device_online set playing=\"\" where device_id=(select distinct id from devices where ip=\""+ip+"\")",(err,result,fields)=>{})
                if(override){
                    playOnDevice(ip,file,0)
                }
            }
            
            
        }).catch((err)=>{
            if(err){
                return err.data
            }
        })
    }
}

async function playWinner(poll_id){
    let win=await con.promise().query("select file from poll_info where poll_id="+poll_id+" and votes in(select max(votes) from poll_info where poll_id="+poll_id+")")
    let dev=await con.promise().query("select distinct ip from devices where id in(select distinct device_id from poll_device where poll_id="+poll_id+")")

    let rnd
    if(win[0].length>1)rnd = (Math.floor(Math.random()*1000))%(win[0].length-1)
    else if(win[0].length==1) rnd=0
    else rnd=-1

    if(rnd>-1){
        //Активировать при окончательном развертывании
        // for(let i=0; i<dev[0].length;i++){
        //     playOnDevice(dev[0][i].ip,win[0][rnd].file,1)
        // }
        con.query("insert poll_expired(poll_name,date_begin,date_end,winner) values(select distinct poll_name, date_begin,date_end, \""+win[0][rnd].file+"\" as file from poll where poll_id="+poll_id+")",(err,result,fields)=>{
        })
        //con.query("delete from poll where poll_id="+poll_id)
        //con.query("delete from poll_info where poll_id="+poll_id)
        //con.query("delete from poll_device where poll_id="+poll_id)
    }
}

cron.schedule('* * * * *', async function() {
    let timeend=await con.promise().query("select distinct poll_id,date_end from poll where date_end<=now()")
    if(timeend[0].length>0){
        for(let i=0; i<timeend[0].length;i++){
            playWinner(timeend[0][i].poll_id)
        }
    }
});

app.get('/polls/set',async (request,response)=>{
    
    if(request.headers.id!==undefined){
        let dict={
            1:"poll_name",
            2:"date_begin",
            3:"date_end",
            4:"row_name",
            5:"votes",
            6:"file",
        }

        decid=request.headers.id
        deccell=decodeURI(request.headers.cell)
        decval=decodeURI(request.headers.val)
        decaddval=decodeURI(request.headers.addval)

        
        if(deccell==='0'){
            con.query("update sq.poll set poll_id=\""+decval+"\" where poll_id="+request.headers.id,(err,result,fields)=>{
                if(err)console.log(err)
                else{
                    con.query("update sq.poll_info set poll_id=\""+decval+"\" where poll_id="+request.headers.id,(err,result,fields)=>{
                
                    })
                    con.query("update sq.poll_device set poll_id=\""+decval+"\" where poll_id="+request.headers.id,(err,result,fields)=>{
                        
                    })
                }
            })
            
        }
        else if(deccell<4){
            con.query("update sq.poll set "+dict[deccell]+"=\""+decval+"\" where poll_id="+request.headers.id,(err,result,fields)=>{
                if(err)console.log(err)
            })
        }
        else if(deccell<7){
            con.query("update sq.poll_info set "+dict[deccell]+"=\""+decval+"\" where id=\""+decid+"\"",(err,result,fields)=>{
                if(err)console.log(err)
            }) 
            if(deccell==6&&decval!=="-2"&&decval!="--"){
                let idx = await con.promise().query("select distinct ip from sq.devices where devices.id in (select distinct device_id from poll_device where poll_id in (select poll_id from poll_info where id="+decid+"))")
                for(let i=0;i<idx[0].length;i++){
                    checkFileOnDevice(idx[0][i].ip,decval);
                }
            }

        }
        else{
            con.query("update sq.poll_device set device_id="+decval+" where id=\""+decid+"\"",(err,result,fields)=>{
                if(err)console.log(err)
            }) 
            let getdevice = await con.promise().query("select if(exists(select id from devices where id="+decval+"),1,0) as ans")

            if(getdevice[0][0].ans=="1"&&decaddval!="-2"&&decaddval!="--"){
                checkFileOnDevice(decval,decaddval)
            }
        }
        response.sendStatus(200)
    }
    else{
        response.sendStatus(400)
    }

})

app.get('/polls/add',async (request,response)=>{
    if(request.headers.mode==1){
        con.query("insert into poll(poll_id, poll_name,date_begin,date_end) values(0,\"\",null,null)",(err,result,fields)=>{
            if(err)console.log(err)
            
        })
        response.sendStatus(200)
    }
    else if(request.headers.mode==2){
        con.query("insert into poll_info(poll_id, row_name,votes,file) values("+request.headers.poll_id+",\"\",0,\"\")",(err,result,fields)=>{
            if(err)console.log(err)
            
        })
        response.sendStatus(200)
    }
    else{
        con.query("insert into poll_device(poll_id, device_id) values("+request.headers.poll_id+",0)",(err,result,fields)=>{
            if(err)console.log(err)
            
        })
        response.sendStatus(200)
    }

})

app.get('/polls/del',async (request,response)=>{
    if(request.headers.mode==1){
        con.query("delete from poll where poll_id="+request.headers.poll_id,(err,result,fields)=>{
            if(err)console.log(err)
        })
        response.sendStatus(200)
    }
    else if(request.headers.mode==2){
        con.query("call delete_from_poll_info("+request.headers.poll_id+",\""+request.headers.optional+"\")",(err,result,fields)=>{
            if(err)console.log(err)
        })
        response.sendStatus(200)
    }
    else{
        con.query("call delete_from_poll_device("+request.headers.poll_id+","+request.headers.optional+")",(err,result,fields)=>{
            if(err)console.log(err)
        })
        response.sendStatus(200)
    }

})

app.get('/votes/inc',async (request,response)=>{
    if(request.headers.row!==undefined){
        con.query("update poll_info set votes=votes+1 where poll_id="+request.headers.id+" and row_name=\""+decodeURI(request.headers.row)+"\"",(err,result,fields)=>{
            if(err)console.log(err)
            else response.sendStatus(200)
        })
    }
    else response.sendStatus(400)
    
})

app.ws('/',(ws,req)=>{
    ws.on('message',(msg)=>{
        let sock = new wsapp.WebSocket('ws://192.168.3.73:8887/')

        sock.send("HELLO")
        ws.send("GOTREQ")
        sock.terminate()
    })
})


app.listen(40005)

