insert sq.poll(votes,music) values(0,"Вариант 1"),(0,"Вариант 2"),(0,"Вариант 3"),(0,"Вариант 4"),(0,"Вариант 5");

insert into sq.users values("root","good");
select * from sq.device_settings;
select * from sq.devices;
select * from sq.device_online;
insert sq.device_settings values (21,"15",0,1,3,"","","192.168.228.77",3005,"ESP32_21","ESP32_21","3.ru.pool.ntp.org",10800);
select distinct id,ip,count(file) as cnt,playing from sq.devices join sq.device_online on device_online.device_id=devices.id group by id,ip,playing