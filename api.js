const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const fs =require('fs')
const formidable = require('formidable');
const axios=require('axios');
const { exec } = require("child_process");
const app = express(); 
const buffer=require("buffer")
app.use(cors());
app.use(express.json());

const con = mysql.createConnection({
    host: 'localhost',
    port: "3306",
    user: "root",
    password: "0000",  
    database:"sq"
});

var onUpload=""

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
app.get('/', (req, res) => {
    res.sendStatus(200)
});

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
//     Место файла конфига:
// sudo nano /usr/local/etc/RHVoice/RHVoice.conf

// Тест:
// echo "Привет!" | RHVoice-test -o "/mnt/c/Games/wav/1.wav" -p aleksandr-hq

    let files=fs.readdirSync(path)
    ress.send(files)
})

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

//Play or stop music on device. 
//When device finished playing a track it sends "stop" header. 
//When "file" header=="STOP" server requests a device to stop playing. 
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

app.get('/device/getConfig',async(req, res) => {

    let configs=[]
    let queryConfig=(await con.promise().query("select * from sq.device_settings").catch((err)=>{}))
    for(let i=0;i<queryConfig[0].length;i++){
        configs.push([])
        configs[i].push(queryConfig[0][i].device_id)
        configs[i].push(queryConfig[0][i].volume)
        configs[i].push(queryConfig[0][i].LRC)
        configs[i].push(queryConfig[0][i].BCLK)
        configs[i].push(queryConfig[0][i].DOUT)
        configs[i].push(queryConfig[0][i].ssid)
        configs[i].push(queryConfig[0][i].password)
        configs[i].push(queryConfig[0][i].server_ip)
        configs[i].push(queryConfig[0][i].server_port)
        configs[i].push(queryConfig[0][i].ap_name)
        configs[i].push(queryConfig[0][i].ap_pass)
        configs[i].push(queryConfig[0][i].ntpServer)
        configs[i].push(queryConfig[0][i].ntpAddTime)
    }
    res.sendStatus(200)
})

app.get('/device/sendCustomMessage',async(req, res) => {
    if(req.headers.message!==undefined){
        res.sendStatus(200)
    }
    else{
      res.sendStatus(400)  
    }
})

app.get('/device/whatPlaying',async(req, ress) => {
    if(req.headers.ip!==undefined){
        await axios.get("http://"+req.headers.ip+":80/whatPlaying").then((res)=>{
        ress.send(res.data)
        }).catch((err)=>{if(err)ress.send(err.data)})
    }
    else ress.sendStatus(400);
})

//Update device schedule where rowid is number of a row in schedule table.
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

app.post('/file/upload',async(req, ress) => {
    let options={
        maxFileSize:25* 1024 * 1024 //20MB
    }
    const form = new formidable.IncomingForm(options);
    form.parse(req, async (err, fields, files) => {
        let fp = decodeURI(files.file.filepath)
        let fileName = decodeURI(fields.fileName)
        let saveDir = decodeURI(fields.saveDir)
        let raw = fs.readFileSync(fp)
        

        //fields.saveDir - directory to save on device      
        fs.writeFile("filesToUpload/"+fileName, raw,(err)=>{
        })
        onUpload="filesToUpload\\"+fileName
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
        
        await axios.post("http://"+fields.ip+":80/upload",{raw},config).then((res)=>{}).catch((error)=>{})
        await axios.get("http://"+fields.ip+":80/getResources").then((res)=>{
            ress.sendStatus(res.status)
        })
    });
})

app.get('/file/download',async(req, ress) => {
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

app.post('/file/delete',async(req, ress) => {
    if(req.headers.gen!==undefined){
        let decname = decodeURI(req.headers.filename)
        await fs.promises.unlink(__dirname+"/genAudio/"+decname)
        ress.send(200)
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

//Устройство отправляет информацию на сервер, потом сервер отправляет устройству расписание
app.post('/device/sendInfo', async (req, res) => {

    con.query("delete from sq.devices where id="+req.body.ID,(err,result,fields)=>{});
        
    for(let i=0; i<req.body.files.length; i++){
        con.query("insert sq.devices(id,ip,file) values(" +
                    req.body.ID +",\"" +
                    req.body.IP +"\",\"" +
                    req.body.files[i] +"\")"
                    ,(err, result, fields) => {})
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

app.post('/user/login', (req, res) => {

    con.query(
    "select if(\"" +
    req.body.pass +
    "\" in (select password from sq.users where \"" +
    req.body.login + 
    "\" in(select login from users)),1,0) as Pass;",
    (err, result, fields) => {
        res.send(""+result[0].Pass)
    })

});

app.get('/get/music', (req, res) => {
    
    var musicList=[];
    var musicVotes=[];

    let songsAmount=0;
    let votesAmount=0;

    con.query("select count(votes) mx, sum(votes) sm from sq.poll",(err, result, fields) => {songsAmount = result[0].mx; votesAmount=result[0].sm})
    
    con.query("select music,votes from sq.poll", (err, result, fields) => {
        if(err)throw err;
        for(var i=0; i<songsAmount; i++){
            musicList.push(result[i].music)
            musicVotes.push(result[i].votes)
        }
        res.send([musicList,musicVotes,songsAmount,votesAmount]);
    });
});

app.get('/get/sched', (req, res) => {
    res.send("1")
});

app.get('/get/schedule', (req, res) => {
 
    var schedule=[],schnum=0,response="";

    con.query("select max(id) id from schedul",(err, result, fields) => {schnum=result[0].id})
    con.query("select timebegin from schedul", (err, result, fields) => {
        if(err)throw err;
        for(var i=0; i<schnum; i++) schedule.push("\""+result[i].timebegin+"\"")

        response = ("{ \"time\": ["+schedule+"],")+ "\"size\": \""+schnum+"\"}";
        res.send(response)
    });

});

app.get('/get/winner',async(req, res) => {

    var schedule=[],winners=0;

    var h = await new Promise((resolve) => {
        con.query("select count(id) num from sq.poll where votes=(select max(votes) from sq.poll)",(err, result, fields) => {
            winners=parseInt(result[0].num,10);
            resolve(res);
        })
    })
    
    con.query("select id from sq.poll where votes=(select max(votes) from sq.poll)",(err, result, fields) => {
        let response
        if(winners>1)response = result[Math.floor(Math.random()*100)%winners].id
        else if(winners===1)response = result[0].id
        res.send("{\"win\": \""+response+"\"}")
        resolve(res)
    }) 
    
    con.query("update sq.poll set votes=0 where votes!=0")
});

app.post('/set/votes',async (request,response)=>{

    queryString ="update sq.poll set votes=? where id = ?"
    con.query(queryString,[request.body.h,request.body.num+1])
    
    var musicList=[];
    var musicVotes=[];

    let songsAmount=0
    let votesAmount=0

    con.query("select count(votes) mx, sum(votes) sm from sq.poll",(err, result, fields) => {songsAmount = result[0].mx; votesAmount=result[0].sm})
    
    con.query("select music,votes from sq.poll", (err, result, fields) => {
        if(err)throw err;
        for(var i=0; i<songsAmount; i++){
            musicList.push(result[i].music)
            musicVotes.push(result[i].votes)
        }
        response.send([musicList,musicVotes,songsAmount,votesAmount]);
    });
});

process.on('exit', function () {
    con.end();
});

app.listen(3005)

