import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, StyleSheet, StatusBar, Platform, Dimensions,
  Alert, Switch, SafeAreaView, FlatList
} from 'react-native';
import UploadScreen from './UploadScreen';

const { width: SW } = Dimensions.get('window');

// ─── DESIGN TOKENS (mirror web) ───
const C = {
  // Neutral — white header like web
  white:   '#FFFFFF',
  bg:      '#F4F6F9',
  surface: '#FFFFFF',
  border:  '#E5E7EB',
  border2: '#F3F4F6',
  text:    '#0F172A',
  text2:   '#475569',
  text3:   '#94A3B8',
  // Red accent
  red:     '#DC2626',
  red2:    '#B91C1C',
  redL:    '#FEF2F2',
  redBd:   '#FCA5A5',
  // Amber banner (same as web)
  amber:   '#FFFBEB',
  amberBd: '#FDE68A',
  amberTx: '#92400E',
  // Status
  green:   '#059669',
  greenL:  '#D1FAE5',
};

// ─── SCHOOL COLORS (same as web) ───
const SCHOOL_LIST = [
  { key:'HUTECH',  full:'HUTECH – ĐH Công nghệ TP.HCM',        bg:'#DBEAFE',br:'#2563EB',tx:'#1E3A8A'},
  { key:'BKU',     full:'BKU – ĐH Bách Khoa TP.HCM',           bg:'#FEF3C7',br:'#D97706',tx:'#78350F'},
  { key:'UIT',     full:'UIT – ĐH Công nghệ Thông tin',         bg:'#D1FAE5',br:'#059669',tx:'#064E3B'},
  { key:'UEL',     full:'UEL – ĐH Kinh tế - Luật',              bg:'#EDE9FE',br:'#7C3AED',tx:'#2E1065'},
  { key:'HCMUTE',  full:'HCMUTE – ĐH Sư phạm Kỹ thuật TP.HCM', bg:'#FCE7F3',br:'#DB2777',tx:'#831843'},
  { key:'TDTU',    full:'TDTU – ĐH Tôn Đức Thắng',              bg:'#CCFBF1',br:'#0D9488',tx:'#042F2E'},
  { key:'HCMUAF',  full:'HCMUAF – ĐH Nông Lâm TP.HCM',          bg:'#FEF9C3',br:'#CA8A04',tx:'#713F12'},
  { key:'UEF',     full:'UEF – ĐH Kinh tế - Tài chính',         bg:'#FFF7ED',br:'#EA580C',tx:'#7C2D12'},
  { key:'VLU',     full:'VLU – ĐH Văn Lang',                     bg:'#ECFDF5',br:'#16A34A',tx:'#14532D'},
  { key:'HUI',     full:'HUI – ĐH Công nghiệp TP.HCM',           bg:'#FDF4FF',br:'#A21CAF',tx:'#4A044E'},
  { key:'HCMUS',   full:'HCMUS – ĐH Khoa học Tự nhiên',          bg:'#ECFEFF',br:'#0891B2',tx:'#164E63'},
  { key:'OTHER',   full:'Trường khác / Nhập tay',                 bg:'#F1F5F9',br:'#64748B',tx:'#1E293B'},
];
const SCHOOL_MAP = Object.fromEntries(SCHOOL_LIST.map(s => [s.key, s]));

function hashColor(str) {
  const P = [
    {bg:'#FEF9C3',br:'#CA8A04',tx:'#713F12'},{bg:'#FCE7F3',br:'#9D174D',tx:'#831843'},
    {bg:'#ECFDF5',br:'#047857',tx:'#022C22'},{bg:'#EFF6FF',br:'#1D4ED8',tx:'#1E3A8A'},
    {bg:'#FFF7ED',br:'#C2410C',tx:'#7C2D12'},{bg:'#F5F3FF',br:'#6D28D9',tx:'#2E1065'},
  ];
  let h = 0; for (let i = 0; i < str.length; i++) h = (h*31 + str.charCodeAt(i)) & 0xFFFFFF;
  return P[Math.abs(h) % P.length];
}

function getColor(cls) {
  if (cls.status === 'makeup')    return {bg:'#D1FAE5',br:'#059669',tx:'#064E3B'};
  if (cls.status === 'cancelled') return {bg:'#F1F5F9',br:'#94A3B8',tx:'#64748B'};
  const key = (cls.truong||'').trim().toUpperCase();
  if (SCHOOL_MAP[key]) return SCHOOL_MAP[key];
  const found = SCHOOL_LIST.find(s => s.full.toUpperCase().includes(key));
  return found || hashColor(key || 'OTHER');
}

// ─── TIER DATA ───
const TT = [
  {n:1,s:'06:45',e:'07:30',sess:'S'},{n:2,s:'07:30',e:'08:15',sess:'S'},{n:3,s:'08:15',e:'09:00',sess:'S'},
  {n:4,s:'09:20',e:'10:05',sess:'S'},{n:5,s:'10:05',e:'10:50',sess:'S'},{n:6,s:'10:50',e:'11:35',sess:'S'},
  {n:7,s:'12:30',e:'13:15',sess:'C'},{n:8,s:'13:15',e:'14:00',sess:'C'},{n:9,s:'14:00',e:'14:45',sess:'C'},
  {n:10,s:'15:05',e:'15:50',sess:'C'},{n:11,s:'15:50',e:'16:35',sess:'C'},{n:12,s:'16:35',e:'17:20',sess:'C'},
  {n:13,s:'18:00',e:'18:45',sess:'T'},{n:14,s:'18:45',e:'19:30',sess:'T'},{n:15,s:'19:30',e:'20:15',sess:'T'},
];
const DF = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];
const DF_SHORT = ['T2','T3','T4','T5','T6','T7','CN'];
const STATUS_LABEL = {normal:'Chính thức', makeup:'Dạy bù', cancelled:'Đã hủy'};

let _nid = 100;
const gid = () => ++_nid;

// ─── DATE HELPERS ───
function getMonday(d) {
  const dt = new Date(d); const day = dt.getDay();
  dt.setDate(dt.getDate()-day+(day===0?-6:1)); dt.setHours(0,0,0,0); return dt;
}
function addDays(d,n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function fmtShort(d) { return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }

function detectSemester(classes) {
  if (!classes.length) return null;
  const cnt = {}; classes.forEach(c => { cnt[c.hk] = (cnt[c.hk]||0)+1; });
  return Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
}


// ════════════════════════════════════════
// DETAIL BOTTOM SHEET
// ════════════════════════════════════════
function DetailSheet({cls, onClose, onEdit, onDelete, onCancel, onRestore}) {
  if (!cls) return null;
  const cl = getColor(cls);
  const ts = TT[cls.tb-1], te = TT[cls.tk-1];
  const rows = [
    ['Mã môn',    cls.ma],
    ['Phòng học', cls.phong],
    ['Trường',    cls.truong],
    ['Lớp',       cls.lop],
    ['Sĩ số',     `${cls.ss} sinh viên`],
    ['Thứ',       DF[cls.thu-2]||''],
    ['Giờ học',   `${ts?.s} – ${te?.e}`],
    ['Tiết',      `${cls.tb}–${cls.tk} (${cls.tk-cls.tb+1} tiết)`],
    ['Học kỳ',    cls.hk],
    ['Trạng thái',STATUS_LABEL[cls.status]||''],
  ];
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={st.sheetOverlay} activeOpacity={1} onPress={onClose}/>
      <View style={st.sheet}>
        <View style={st.sheetHandle}/>
        {/* Header card — same color as web block */}
        <View style={[st.detailHeader,{backgroundColor:cl.bg,borderLeftColor:cl.br}]}>
          <Text style={[st.detailCode,{color:cl.br}]}>{cls.ma}</Text>
          <Text style={[st.detailName,{color:cl.tx}]}>{cls.ten}</Text>
          <View style={[st.statusPill,{backgroundColor:cl.br+'22'}]}>
            <Text style={[st.statusPillTx,{color:cl.br}]}>{STATUS_LABEL[cls.status]}</Text>
          </View>
        </View>
        {/* Info rows */}
        <ScrollView style={{maxHeight:300}}>
          {rows.map(([l,v])=>(
            <View key={l} style={st.detailRow}>
              <Text style={st.detailLbl}>{l}</Text>
              <Text style={st.detailVal}>{v}</Text>
            </View>
          ))}
        </ScrollView>
        {/* Actions */}
        <View style={st.sheetActions}>
          <TouchableOpacity style={[st.sheetBtn,st.btnEdit]} onPress={onEdit}>
            <Text style={st.btnEditTx}>✏️  Sửa</Text>
          </TouchableOpacity>
          {cls.status!=='cancelled'
            ? <TouchableOpacity style={[st.sheetBtn,st.btnCancel]} onPress={onCancel}>
                <Text style={st.btnCancelTx}>⛔  Hủy buổi</Text>
              </TouchableOpacity>
            : <TouchableOpacity style={[st.sheetBtn,st.btnRestore]} onPress={onRestore}>
                <Text style={st.btnRestoreTx}>↩️  Khôi phục</Text>
              </TouchableOpacity>
          }
          <TouchableOpacity style={[st.sheetBtn,st.btnDel]} onPress={onDelete}>
            <Text style={st.btnDelTx}>🗑️  Xóa</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={st.sheetClose} onPress={onClose}>
          <Text style={st.sheetCloseTx}>Đóng</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════
// ADD / EDIT MODAL
// ════════════════════════════════════════
const BLANK = {ma:'',ten:'',phong:'',lop:'',ss:35,tb:2,tk:6,hk:'HK2 25-26',thu:2,truong:'HUTECH',status:'normal'};

function AEModal({init, onSave, onClose}) {
  const [f,setF] = useState(init?{...init}:{...BLANK});
  const [schoolQ,setSchoolQ] = useState(init?.truong||'HUTECH');
  const [showDrop,setShowDrop] = useState(false);
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const cl = getColor({...f,truong:schoolQ,status:'normal'});
  const filtered = SCHOOL_LIST.filter(s=>
    s.key.toLowerCase().includes(schoolQ.toLowerCase())||
    s.full.toLowerCase().includes(schoolQ.toLowerCase())
  );
  const save = () => {
    if(!f.ma.trim()||!f.ten.trim()){Alert.alert('Thiếu thông tin','Vui lòng nhập Mã môn và Tên môn!');return;}
    const tb=parseInt(f.tb)||1, tk=parseInt(f.tk)||tb;
    onSave({...f,truong:schoolQ,tb,tk,st:tk-tb+1,id:f.id||gid()});
  };
  const IS = st.formInput;
  const LS = st.formLabel;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.aeOverlay}>
        <View style={st.aeModal}>
          <View style={st.aeHeader}>
            <Text style={st.aeTitle}>{init?'✏️  Sửa buổi dạy':'➕  Thêm buổi dạy'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={{fontSize:22,color:C.text3}}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16}}>
            <Text style={LS}>Mã môn học *</Text>
            <TextInput style={IS} value={f.ma} onChangeText={v=>set('ma',v)} placeholder="VD: CMP3019" placeholderTextColor={C.text3}/>
            <Text style={LS}>Tên môn học *</Text>
            <TextInput style={[IS,{height:72,textAlignVertical:'top'}]} value={f.ten} onChangeText={v=>set('ten',v)} placeholder="Tên học phần" multiline placeholderTextColor={C.text3}/>
            {/* Thứ chips */}
            <Text style={LS}>Thứ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}>
              {DF.map((d,i)=>(
                <TouchableOpacity key={i} onPress={()=>set('thu',i+2)}
                  style={[st.chip,f.thu===i+2&&st.chipActive]}>
                  <Text style={[st.chipTx,f.thu===i+2&&st.chipTxActive]}>{DF_SHORT[i]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Status */}
            <Text style={LS}>Trạng thái</Text>
            <View style={{flexDirection:'row',gap:8,marginBottom:14}}>
              {Object.entries(STATUS_LABEL).map(([k,v])=>(
                <TouchableOpacity key={k} onPress={()=>set('status',k)}
                  style={[st.statusBtn,
                    f.status===k&&k==='normal'&&st.statusBtnNormal,
                    f.status===k&&k==='makeup'&&st.statusBtnMakeup,
                    f.status===k&&k==='cancelled'&&st.statusBtnCancelled,
                  ]}>
                  <Text style={[st.statusBtnTx,
                    f.status===k&&k==='normal'&&{color:'#1D4ED8'},
                    f.status===k&&k==='makeup'&&{color:C.green},
                    f.status===k&&k==='cancelled'&&{color:'#64748B'},
                  ]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* 2-col grid */}
            <View style={{flexDirection:'row',gap:10}}>
              <View style={{flex:1}}>
                <Text style={LS}>Phòng học</Text>
                <TextInput style={IS} value={f.phong} onChangeText={v=>set('phong',v)} placeholder="E1-07.08" placeholderTextColor={C.text3}/>
              </View>
              <View style={{flex:1}}>
                <Text style={LS}>Lớp</Text>
                <TextInput style={IS} value={f.lop} onChangeText={v=>set('lop',v)} placeholder="01" placeholderTextColor={C.text3}/>
              </View>
            </View>
            <View style={{flexDirection:'row',gap:10}}>
              <View style={{flex:1}}>
                <Text style={LS}>Tiết bắt đầu</Text>
                <TextInput style={IS} keyboardType="number-pad" value={String(f.tb)} onChangeText={v=>set('tb',v)} placeholderTextColor={C.text3}/>
              </View>
              <View style={{flex:1}}>
                <Text style={LS}>Tiết kết thúc</Text>
                <TextInput style={IS} keyboardType="number-pad" value={String(f.tk)} onChangeText={v=>set('tk',v)} placeholderTextColor={C.text3}/>
              </View>
            </View>
            <View style={{flexDirection:'row',gap:10}}>
              <View style={{flex:1}}>
                <Text style={LS}>Sĩ số</Text>
                <TextInput style={IS} keyboardType="number-pad" value={String(f.ss)} onChangeText={v=>set('ss',v)} placeholderTextColor={C.text3}/>
              </View>
              <View style={{flex:1}}>
                <Text style={LS}>Học kỳ</Text>
                <TextInput style={IS} value={f.hk} onChangeText={v=>set('hk',v)} placeholderTextColor={C.text3}/>
              </View>
            </View>
            {/* School */}
            <Text style={LS}>Trường</Text>
            <TextInput style={[IS,{borderColor:cl.br,borderWidth:1.5}]}
              value={schoolQ} onChangeText={v=>{setSchoolQ(v);setShowDrop(true);}}
              onFocus={()=>setShowDrop(true)} placeholder="HUTECH, BKU..." placeholderTextColor={C.text3}/>
            <View style={[st.schoolPreview,{backgroundColor:cl.bg,borderColor:cl.br}]}>
              <View style={[st.schoolDot,{backgroundColor:cl.br}]}/>
              <Text style={{fontSize:13,fontWeight:'600',color:cl.tx}}>{schoolQ||'Nhập tên trường'}</Text>
            </View>
            {showDrop&&filtered.length>0&&(
              <View style={st.dropdown}>
                {filtered.slice(0,8).map(sch=>(
                  <TouchableOpacity key={sch.key} style={st.dropItem}
                    onPress={()=>{setSchoolQ(sch.key);set('truong',sch.key);setShowDrop(false);}}>
                    <View style={[st.dropDot,{backgroundColor:sch.br}]}/>
                    <View>
                      <Text style={{fontSize:13,fontWeight:'700',color:C.text}}>{sch.key}</Text>
                      <Text style={{fontSize:11,color:C.text3}}>{sch.full}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={st.aeFooter}>
            <TouchableOpacity style={st.btnSecondary} onPress={onClose}>
              <Text style={st.btnSecondaryTx}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.btnPrimary} onPress={save}>
              <Text style={st.btnPrimaryTx}>💾  Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════
// TKB SCREEN — list by day
// ════════════════════════════════════════
function TKBScreen({classes, onPick, onAdd, weekOffset, onWeekChange}) {
  const base = getMonday(new Date());
  const ws = addDays(base, weekOffset*7);
  const we = addDays(ws, 6);
  const today = new Date(); today.setHours(0,0,0,0);

  const grouped = {};
  for(let i=0;i<7;i++) grouped[i+2]=[];
  classes.forEach(c=>{if(grouped[c.thu]) grouped[c.thu].push(c);});

  return (
    <View style={{flex:1,backgroundColor:C.bg}}>
      {/* Week bar — white, like web */}
      <View style={st.weekBar}>
        <TouchableOpacity style={st.weekNavBtn} onPress={()=>onWeekChange(-1)}>
          <Text style={st.weekNavTx}>‹</Text>
        </TouchableOpacity>
        <View style={{alignItems:'center',flex:1}}>
          <Text style={st.weekRange}>{fmtShort(ws)} – {fmtShort(we)}</Text>
          <Text style={st.weekSub}>{weekOffset===0?'Tuần hiện tại':weekOffset>0?`+${weekOffset} tuần`:`${weekOffset} tuần`}</Text>
        </View>
        <TouchableOpacity style={st.weekNavBtn} onPress={()=>onWeekChange(1)}>
          <Text style={st.weekNavTx}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.todayBtn} onPress={()=>onWeekChange(-weekOffset)}>
          <Text style={st.todayBtnTx}>Hôm nay</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{padding:14,paddingBottom:100}}>
        {[2,3,4,5,6,7,8].map((thu,idx)=>{
          const dayClasses = grouped[thu]||[];
          const dayDate = addDays(ws,idx);
          const isToday = dayDate.getTime()===today.getTime();
          return (
            <View key={thu} style={{marginBottom:12}}>
              {/* Day header — red text for today */}
              <View style={st.dayHeader}>
                <Text style={[st.dayHeaderTx,isToday&&{color:C.red}]}>
                  {DF[idx]},  {fmtShort(dayDate)}
                </Text>
                {isToday&&<View style={st.todayDot}/>}
              </View>
              {dayClasses.length===0
                ? <View style={st.emptyDay}><Text style={st.emptyDayTx}>Không có lịch dạy</Text></View>
                : dayClasses.map(c=>{
                    const cl=getColor(c);
                    const ts=TT[c.tb-1],te=TT[c.tk-1];
                    const cancelled=c.status==='cancelled';
                    const makeup=c.status==='makeup';
                    return (
                      <TouchableOpacity key={c.id} activeOpacity={0.82}
                        style={[st.classCard,{borderLeftColor:cl.br,backgroundColor:cl.bg,opacity:cancelled?.65:1}]}
                        onPress={()=>onPick(c)}>
                        <View style={{flex:1}}>
                          {makeup&&<Text style={st.tagMakeup}>DẠY BÙ</Text>}
                          {cancelled&&<Text style={st.tagCancelled}>ĐÃ HỦY</Text>}
                          <Text style={[st.classCode,{color:cl.br}]}>{c.ma}</Text>
                          <Text style={[st.className,{color:cancelled?C.text3:cl.tx}]}>{c.ten}</Text>
                          <Text style={[st.classRoom,{color:cancelled?C.text3:cl.br}]}>📍 {c.phong}  ·  Lớp {c.lop}</Text>
                        </View>
                        <View style={[st.tierBadge,{borderColor:cl.br,backgroundColor:cl.br+'18'}]}>
                          <Text style={[st.tierBadgeTx,{color:cl.br}]}>T{c.tb}–{c.tk}</Text>
                          <Text style={[st.tierTime,{color:cl.br}]}>{ts?.s}</Text>
                          <Text style={[st.tierTime,{color:cl.br}]}>{te?.e}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
              }
            </View>
          );
        })}
      </ScrollView>
      {/* FAB */}
      <TouchableOpacity style={st.fab} onPress={onAdd}>
        <Text style={st.fabTx}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ════════════════════════════════════════
// FREE SLOTS SCREEN
// ════════════════════════════════════════
const SESSIONS = [
  {key:'S',label:'Sáng', from:1, to:6,  color:'#B45309',bg:'#FFFBEB',border:'#FCD34D'},
  {key:'C',label:'Chiều',from:7, to:12, color:'#4C1D95',bg:'#F5F3FF',border:'#A78BFA'},
  {key:'T',label:'Tối',  from:13,to:15, color:'#064E3B',bg:'#F0FDF4',border:'#6EE7B7'},
];

function freeRanges(occ,from,to) {
  const res=[]; let st=null;
  for(let t=from;t<=to;t++){
    if(!occ.has(t)){if(st===null)st=t;}
    else{if(st!==null){res.push({f:st,t:t-1});st=null;}}
  }
  if(st!==null) res.push({f:st,t:to});
  return res;
}

function FreeScreen({classes}) {
  const [filter,setFilter]=useState(null);
  const days=DF.map((dn,idx)=>{
    const thu=idx+2;
    const dcs=classes.filter(c=>c.thu===thu);
    const occ=new Set(); dcs.forEach(c=>{for(let t=c.tb;t<=c.tk;t++)occ.add(t);});
    const sessions=SESSIONS.map(sess=>({...sess,ranges:freeRanges(occ,sess.from,sess.to)})).filter(s=>s.ranges.length>0);
    return{dn,idx,thu,dcs,sessions,total:sessions.reduce((a,s)=>a+s.ranges.length,0)};
  });
  const shown=filter!==null?[days[filter]]:days;
  return (
    <View style={{flex:1,backgroundColor:C.bg}}>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{backgroundColor:C.white,borderBottomWidth:1,borderBottomColor:C.border,maxHeight:52}}
        contentContainerStyle={{padding:10,gap:6,flexDirection:'row'}}>
        {['Tất cả',...DF_SHORT].map((d,i)=>(
          <TouchableOpacity key={i} onPress={()=>setFilter(i===0?null:i-1)}
            style={[st.filterChip,(i===0?filter===null:filter===i-1)&&st.filterChipActive]}>
            <Text style={[st.filterChipTx,(i===0?filter===null:filter===i-1)&&st.filterChipTxActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{padding:14,paddingBottom:20}}>
        {shown.map(day=>(
          <View key={day.thu} style={st.freeCard}>
            <View style={st.freeCardHead}>
              <Text style={st.freeCardDay}>{day.dn}</Text>
              <View style={[st.freeBadge,{backgroundColor:day.total>0?'#DCFCE7':'#FEF2F2'}]}>
                <Text style={[st.freeBadgeTx,{color:day.total>0?C.green:C.red}]}>
                  {day.total>0?`${day.total} trống`:'Kín lịch'}
                </Text>
              </View>
            </View>
            {day.sessions.length===0
              ?<Text style={st.freeEmptyTx}>Không có tiết trống</Text>
              :day.sessions.map(sess=>(
                <View key={sess.key}>
                  <View style={[st.sessLabel,{backgroundColor:sess.bg,borderLeftColor:sess.border}]}>
                    <Text style={{fontSize:12,fontWeight:'700',color:sess.color}}>
                      {sess.label} (T{sess.from}–{sess.to})
                    </Text>
                  </View>
                  {sess.ranges.map((sl,si)=>(
                    <View key={si} style={st.freeSlot}>
                      <View style={st.freeDot}/>
                      <View style={{flex:1}}>
                        <Text style={st.freeSlotTier}>
                          {sl.f===sl.t?`Tiết ${sl.f}`:`Tiết ${sl.f}–${sl.t}`}
                        </Text>
                        <Text style={st.freeSlotTime}>
                          {TT[sl.f-1]?.s} → {TT[sl.t-1]?.e}{sl.f!==sl.t?` · ${sl.t-sl.f+1} tiết`:''}
                        </Text>
                      </View>
                      <View style={st.freeTag}><Text style={st.freeTagTx}>Trống</Text></View>
                    </View>
                  ))}
                </View>
              ))
            }
            {day.dcs.length>0&&(
              <View style={st.occWrap}>
                <Text style={st.occLabel}>Đã có lịch:</Text>
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:4,marginTop:4}}>
                  {day.dcs.map(c=>{const cl=getColor(c);return(
                    <View key={c.id} style={[st.occChip,{backgroundColor:cl.bg,borderColor:cl.br}]}>
                      <Text style={{fontSize:11,fontWeight:'600',color:cl.tx}}>T{c.tb}–{c.tk}: {c.ma}</Text>
                    </View>
                  );})}
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ════════════════════════════════════════
// NOTIFICATIONS SCREEN
// ════════════════════════════════════════
function NotifScreen({classes}) {
  const [notifOn,setNotifOn]=useState(false);
  const [settings,setSettings]=useState([
    {key:'24h',label:'🔔  Nhắc trước 24 giờ',sub:'1 ngày trước mỗi buổi dạy',on:true},
    {key:'1h', label:'⏰  Nhắc trước 1 giờ', sub:'1 tiếng trước mỗi buổi',   on:true},
    {key:'sfx',label:'🔊  Âm thanh',          sub:'Phát âm khi có nhắc',      on:false},
  ]);
  const toggle=key=>setSettings(p=>p.map(s=>s.key===key?{...s,on:!s.on}:s));
  return (
    <ScrollView style={{flex:1,backgroundColor:C.bg}} contentContainerStyle={{padding:14,paddingBottom:30}}>
      {/* Banner — amber like web */}
      <View style={[st.notifBanner,{backgroundColor:notifOn?'#F0FDF4':'#FFFBEB',borderColor:notifOn?'#86EFAC':'#FDE68A'}]}>
        <Text style={{fontSize:22,marginRight:10}}>{notifOn?'✅':'🔔'}</Text>
        <View style={{flex:1}}>
          <Text style={[st.notifBannerTitle,{color:notifOn?'#15803D':'#92400E'}]}>
            {notifOn?'Thông báo đang bật':'Bật thông báo'}
          </Text>
          <Text style={[st.notifBannerSub,{color:notifOn?'#16A34A':'#B45309'}]}>
            Nhận nhắc nhở trước mỗi buổi dạy
          </Text>
        </View>
        <Switch value={notifOn} onValueChange={setNotifOn}
          trackColor={{false:'#D1D5DB',true:C.green}} thumbColor={C.white}/>
      </View>

      {/* Sample */}
      <View style={st.sampleCard}>
        <View style={st.sampleIcon}><Text style={{fontSize:20}}>🔔</Text></View>
        <View style={{flex:1}}>
          <Text style={st.sampleLabel}>VÍ DỤ THÔNG BÁO</Text>
          <Text style={st.sampleTitle}>📅 Ngày mai có lớp lúc 07:30</Text>
          <Text style={st.sampleSub}>Phân tích Thiết kế HT · E1-07.08 · Tiết 2–6</Text>
        </View>
      </View>

      {/* Settings card */}
      <View style={st.card}>
        <Text style={st.cardHead}>Cài đặt thông báo</Text>
        {settings.map(s=>(
          <View key={s.key} style={st.settingRow}>
            <View style={{flex:1}}>
              <Text style={st.settingLabel}>{s.label}</Text>
              <Text style={st.settingSub}>{s.sub}</Text>
            </View>
            <Switch value={s.on} onValueChange={()=>toggle(s.key)}
              trackColor={{false:'#D1D5DB',true:C.red}} thumbColor={C.white}
              disabled={!notifOn}/>
          </View>
        ))}
        {!notifOn&&<Text style={st.disabledHint}>Bật thông báo ở trên để sử dụng</Text>}
      </View>

      {/* Upcoming */}
      <View style={[st.card,{marginTop:14}]}>
        <Text style={st.cardHead}>Lịch dạy sắp tới</Text>
        {classes.filter(c=>c.status!=='cancelled').map(c=>{
          const cl=getColor(c);
          return(
            <View key={c.id} style={st.notifRow}>
              <View style={[st.notifBar,{backgroundColor:cl.br}]}/>
              <View style={{flex:1}}>
                <Text style={[st.notifDay,{color:cl.br}]}>{DF[c.thu-2]} · Tiết {c.tb}–{c.tk} · {TT[c.tb-1]?.s}</Text>
                <Text style={st.notifName}>{c.ten}</Text>
                <Text style={st.notifMeta}>{c.phong} · {c.ma} · {c.truong}</Text>
              </View>
              <View style={[st.notifBadge,{backgroundColor:c.status==='makeup'?'#D1FAE5':'#DCFCE7'}]}>
                <Text style={{fontSize:12,fontWeight:'700',color:c.status==='makeup'?C.green:'#15803D'}}>
                  {c.status==='makeup'?'Dạy bù':'Sắp tới'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ════════════════════════════════════════
// BOTTOM NAV
// ════════════════════════════════════════
const TABS = [
  {id:'tkb',   ic:'📅',label:'Lịch dạy'},
  {id:'free',  ic:'🕐',label:'Lịch trống'},
  {id:'upload',ic:'📤',label:'Upload'},
  {id:'notif', ic:'🔔',label:'Nhắc nhở'},
];
function BottomNav({active,onChange}) {
  return (
    <View style={st.bottomNav}>
      {TABS.map(t=>(
        <TouchableOpacity key={t.id} style={[st.navItem,active===t.id&&st.navItemActive]} onPress={()=>onChange(t.id)}>
          <Text style={{fontSize:20}}>{t.ic}</Text>
          <Text style={[st.navLabel,active===t.id&&st.navLabelActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════
const PAGE_TITLES = {tkb:'Thời Khóa Biểu',free:'Lịch Trống',upload:'Cập Nhật TKB',notif:'Thông Báo'};
const PAGE_ICONS  = {tkb:'📅',free:'🕐',upload:'📤',notif:'🔔'};

export default function App() {
  const [tab,setTab]=useState('tkb');
  const [classes,setClasses]=useState(INIT_CLASSES);
  const [sel,setSel]=useState(null);
  const [editCls,setEditCls]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  const [weekOffset,setWeekOffset]=useState(0);
  const [banner,setBanner]=useState(true);

  const semester = useMemo(()=>detectSemester(classes),[classes]);

  const saveClass = c => {
    if(c.id&&classes.find(x=>x.id===c.id)) setClasses(p=>p.map(x=>x.id===c.id?c:x));
    else setClasses(p=>[...p,c]);
    setEditCls(null);setShowAdd(false);setSel(null);
  };
  const deleteClass = id => {
    Alert.alert('Xóa buổi dạy?','Buổi dạy này sẽ bị xóa vĩnh viễn.',[
      {text:'Hủy',style:'cancel'},
      {text:'Xóa',style:'destructive',onPress:()=>{setClasses(p=>p.filter(c=>c.id!==id));setSel(null);}}
    ]);
  };
  const cancelClass  = id => {setClasses(p=>p.map(c=>c.id===id?{...c,status:'cancelled'}:c));setSel(null);};
  const restoreClass = id => {setClasses(p=>p.map(c=>c.id===id?{...c,status:'normal'}:c));setSel(null);};

  return (
    <SafeAreaView style={{flex:1,backgroundColor:C.white}}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white}/>

      {/* Header — white like web */}
      <View style={st.header}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <Text style={{fontSize:22}}>{PAGE_ICONS[tab]}</Text>
          <Text style={st.headerTitle}>{PAGE_TITLES[tab]}</Text>
        </View>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          {semester&&<View style={st.semBadge}><Text style={st.semBadgeTx}>{semester}</Text></View>}
          <TouchableOpacity style={st.notifIconBtn} onPress={()=>setTab('notif')}>
            <Text style={{fontSize:18}}>🔔</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Amber banner — same as web */}
      {banner&&(
        <View style={st.amberBanner}>
          <Text style={{fontSize:14,marginRight:6}}>📌</Text>
          <Text style={st.amberBannerTx} numberOfLines={1}>
            Sắp tới: {classes.find(c=>c.status!=='cancelled')?.ten||''}
          </Text>
          <TouchableOpacity onPress={()=>setBanner(false)}>
            <Text style={{fontSize:18,color:C.amberTx,opacity:.7,paddingLeft:8}}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      <View style={{flex:1,backgroundColor:C.bg}}>
        {tab==='tkb'&&<TKBScreen classes={classes} onPick={setSel} onAdd={()=>setShowAdd(true)} weekOffset={weekOffset} onWeekChange={d=>setWeekOffset(o=>o+d)}/>}
        {tab==='free'&&<FreeScreen classes={classes}/>}
        {tab==='upload'&&<UploadScreen onSuccess={nc=>{setClasses(p=>[...p,...nc]);setTab('tkb');}}/>}
        {tab==='notif'&&<NotifScreen classes={classes}/>}
      </View>

      <BottomNav active={tab} onChange={setTab}/>

      {sel&&!editCls&&(
        <DetailSheet cls={sel} onClose={()=>setSel(null)}
          onEdit={()=>{setEditCls(sel);setSel(null);}}
          onDelete={()=>deleteClass(sel.id)}
          onCancel={()=>cancelClass(sel.id)}
          onRestore={()=>restoreClass(sel.id)}/>
      )}
      {(showAdd||editCls)&&(
        <AEModal init={editCls} onSave={saveClass} onClose={()=>{setShowAdd(false);setEditCls(null);}}/>
      )}
    </SafeAreaView>
  );
}

// ════════════════════════════════════════
// STYLES
// ════════════════════════════════════════
const st = StyleSheet.create({
  // Header — white, border bottom
  header:        {backgroundColor:C.white,borderBottomWidth:1.5,borderBottomColor:C.border,paddingHorizontal:16,height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  headerTitle:   {fontSize:20,fontWeight:'700',color:C.text,letterSpacing:-0.3},
  semBadge:      {backgroundColor:'#F1F5F9',paddingHorizontal:12,paddingVertical:4,borderRadius:20,borderWidth:1,borderColor:'#E2E8F0'},
  semBadgeTx:    {fontSize:12,fontWeight:'600',color:'#475569'},
  notifIconBtn:  {width:36,height:36,borderRadius:9,backgroundColor:'#F8FAFC',borderWidth:1,borderColor:C.border,alignItems:'center',justifyContent:'center'},

  // Amber banner
  amberBanner:   {backgroundColor:C.amber,borderBottomWidth:1,borderBottomColor:C.amberBd,paddingHorizontal:16,paddingVertical:10,flexDirection:'row',alignItems:'center'},
  amberBannerTx: {flex:1,fontSize:14,color:C.amberTx,fontWeight:'500'},

  // Week bar
  weekBar:       {backgroundColor:C.white,borderBottomWidth:1,borderBottomColor:C.border,flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingVertical:10,gap:8},
  weekNavBtn:    {width:36,height:36,backgroundColor:'#F8FAFC',borderRadius:8,borderWidth:1,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  weekNavTx:     {fontSize:20,fontWeight:'700',color:'#374151'},
  weekRange:     {fontSize:15,fontWeight:'700',color:C.text},
  weekSub:       {fontSize:13,color:C.red,fontWeight:'600',marginTop:1},
  todayBtn:      {paddingHorizontal:12,paddingVertical:6,borderRadius:8,borderWidth:1,borderColor:C.border,backgroundColor:C.white},
  todayBtnTx:    {fontSize:13,fontWeight:'600',color:'#64748B'},

  // Day + class cards
  dayHeader:     {paddingVertical:6,paddingHorizontal:2,marginBottom:4,flexDirection:'row',alignItems:'center',gap:6},
  dayHeaderTx:   {fontSize:15,fontWeight:'700',color:'#374151'},
  todayDot:      {width:7,height:7,borderRadius:3.5,backgroundColor:C.red},
  emptyDay:      {backgroundColor:C.white,borderRadius:10,padding:14,marginBottom:4,alignItems:'center',borderWidth:1,borderColor:C.border2},
  emptyDayTx:    {fontSize:14,color:C.text3},

  classCard:     {borderRadius:10,padding:13,marginBottom:7,borderLeftWidth:4,flexDirection:'row',alignItems:'flex-start'},
  tagMakeup:     {fontSize:10,fontWeight:'700',color:C.green,marginBottom:3},
  tagCancelled:  {fontSize:10,fontWeight:'700',color:'#94A3B8',marginBottom:3},
  classCode:     {fontSize:12,fontWeight:'700',marginBottom:3,fontFamily:Platform.OS==='ios'?'Menlo':'monospace'},
  className:     {fontSize:15,fontWeight:'700',lineHeight:20,marginBottom:5},
  classRoom:     {fontSize:13,fontWeight:'500'},
  tierBadge:     {alignItems:'center',borderRadius:9,padding:7,borderWidth:1,minWidth:52,marginLeft:10},
  tierBadgeTx:   {fontSize:12,fontWeight:'700'},
  tierTime:      {fontSize:10,marginTop:2},

  // FAB
  fab:           {position:'absolute',right:16,bottom:72,width:56,height:56,backgroundColor:C.red,borderRadius:28,alignItems:'center',justifyContent:'center',elevation:6,shadowColor:'#000',shadowOffset:{width:0,height:3},shadowOpacity:.25,shadowRadius:5},
  fabTx:         {color:C.white,fontSize:30,fontWeight:'300',lineHeight:34},

  // Bottom nav
  bottomNav:     {flexDirection:'row',backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border,paddingBottom:Platform.OS==='ios'?20:0},
  navItem:       {flex:1,alignItems:'center',justifyContent:'center',paddingVertical:8,borderTopWidth:2.5,borderTopColor:'transparent'},
  navItemActive: {backgroundColor:'#FEF2F2',borderTopColor:C.red},
  navLabel:      {fontSize:11,color:C.text3,fontWeight:'500',marginTop:2},
  navLabelActive:{color:C.red,fontWeight:'700'},

  // Detail sheet
  sheetOverlay:  {position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,.45)'},
  sheet:         {position:'absolute',bottom:0,left:0,right:0,backgroundColor:C.white,borderTopLeftRadius:22,borderTopRightRadius:22,paddingBottom:28,maxHeight:'88%'},
  sheetHandle:   {width:38,height:4,backgroundColor:C.border,borderRadius:2,alignSelf:'center',marginTop:12,marginBottom:8},
  detailHeader:  {marginHorizontal:14,marginBottom:12,borderRadius:10,padding:14,borderLeftWidth:4},
  detailCode:    {fontSize:12,fontWeight:'700',marginBottom:3,fontFamily:Platform.OS==='ios'?'Menlo':'monospace'},
  detailName:    {fontSize:16,fontWeight:'700',lineHeight:22,marginBottom:6},
  statusPill:    {alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:3,borderRadius:6},
  statusPillTx:  {fontSize:12,fontWeight:'700'},
  detailRow:     {flexDirection:'row',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#F3F4F6',alignItems:'center'},
  detailLbl:     {fontSize:14,color:C.text3},
  detailVal:     {fontSize:14,fontWeight:'500',color:C.text,textAlign:'right',maxWidth:'60%'},
  sheetActions:  {flexDirection:'row',gap:7,paddingHorizontal:14,paddingTop:12},
  sheetBtn:      {flex:1,paddingVertical:11,borderRadius:9,alignItems:'center'},
  btnEdit:       {backgroundColor:'#FFFBEB',borderWidth:1,borderColor:'#FCD34D'},
  btnEditTx:     {color:'#B45309',fontWeight:'700',fontSize:13},
  btnCancel:     {backgroundColor:'#FFFBEB',borderWidth:1,borderColor:'#FCD34D'},
  btnCancelTx:   {color:'#B45309',fontWeight:'700',fontSize:13},
  btnRestore:    {backgroundColor:'#D1FAE5',borderWidth:1,borderColor:'#059669'},
  btnRestoreTx:  {color:C.green,fontWeight:'700',fontSize:13},
  btnDel:        {backgroundColor:'#FEF2F2',borderWidth:1,borderColor:'#FECACA'},
  btnDelTx:      {color:C.red,fontWeight:'700',fontSize:13},
  sheetClose:    {marginHorizontal:14,marginTop:10,paddingVertical:12,backgroundColor:'#F8FAFC',borderRadius:9,borderWidth:1,borderColor:C.border,alignItems:'center'},
  sheetCloseTx:  {fontSize:14,fontWeight:'600',color:'#64748B'},

  // AE Modal
  aeOverlay:     {flex:1,backgroundColor:'rgba(0,0,0,.45)',justifyContent:'flex-end'},
  aeModal:       {backgroundColor:C.white,borderTopLeftRadius:20,borderTopRightRadius:20,maxHeight:'96%',flex:1},
  aeHeader:      {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:18,borderBottomWidth:1,borderBottomColor:C.border},
  aeTitle:       {fontSize:16,fontWeight:'700',color:C.text},
  aeFooter:      {flexDirection:'row',gap:8,padding:14,borderTopWidth:1,borderTopColor:C.border},
  formLabel:     {fontSize:12,color:'#64748B',fontWeight:'700',marginBottom:5,textTransform:'uppercase',letterSpacing:0.4},
  formInput:     {borderWidth:1,borderColor:C.border,borderRadius:8,paddingHorizontal:11,paddingVertical:10,fontSize:14,color:C.text,backgroundColor:C.white,marginBottom:12},
  chip:          {paddingHorizontal:13,paddingVertical:7,borderRadius:16,borderWidth:1,borderColor:C.border,backgroundColor:C.white,marginRight:7},
  chipActive:    {backgroundColor:C.red,borderColor:C.red},
  chipTx:        {fontSize:13,color:'#64748B',fontWeight:'600'},
  chipTxActive:  {color:C.white},
  statusBtn:     {flex:1,paddingVertical:10,borderRadius:8,borderWidth:1,borderColor:C.border,backgroundColor:C.white,alignItems:'center',marginRight:6},
  statusBtnNormal:   {backgroundColor:'#EFF6FF',borderColor:'#2563EB'},
  statusBtnMakeup:   {backgroundColor:'#D1FAE5',borderColor:C.green},
  statusBtnCancelled:{backgroundColor:'#F1F5F9',borderColor:'#94A3B8'},
  statusBtnTx:   {fontSize:12,fontWeight:'700',color:'#64748B'},
  schoolPreview: {flexDirection:'row',alignItems:'center',gap:8,padding:10,borderRadius:8,borderWidth:1.5,marginBottom:10},
  schoolDot:     {width:14,height:14,borderRadius:7,flexShrink:0},
  dropdown:      {borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white,marginBottom:10,overflow:'hidden'},
  dropItem:      {flexDirection:'row',gap:10,alignItems:'center',padding:12,borderBottomWidth:1,borderBottomColor:'#F3F4F6'},
  dropDot:       {width:10,height:10,borderRadius:5},
  btnPrimary:    {flex:2,padding:12,backgroundColor:C.red,borderRadius:9,alignItems:'center'},
  btnPrimaryTx:  {color:C.white,fontWeight:'700',fontSize:14},
  btnSecondary:  {flex:1,padding:12,backgroundColor:'#F8FAFC',borderRadius:9,alignItems:'center',borderWidth:1,borderColor:C.border},
  btnSecondaryTx:{color:'#64748B',fontWeight:'600',fontSize:13},

  // Free screen
  filterChip:      {paddingHorizontal:14,paddingVertical:6,borderRadius:16,borderWidth:1,borderColor:C.border,backgroundColor:C.white},
  filterChipActive:{backgroundColor:C.red,borderColor:C.red},
  filterChipTx:    {fontSize:13,color:'#64748B',fontWeight:'600'},
  filterChipTxActive:{color:C.white},
  freeCard:        {backgroundColor:C.white,borderRadius:10,borderWidth:1,borderColor:C.border,marginBottom:10,overflow:'hidden'},
  freeCardHead:    {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:12,backgroundColor:'#FAFAFA',borderBottomWidth:1,borderBottomColor:'#F3F4F6'},
  freeCardDay:     {fontSize:15,fontWeight:'700',color:C.text},
  freeBadge:       {paddingHorizontal:10,paddingVertical:4,borderRadius:10},
  freeBadgeTx:     {fontSize:12,fontWeight:'700'},
  freeEmptyTx:     {textAlign:'center',fontSize:13,color:C.text3,padding:14},
  sessLabel:       {padding:6,paddingHorizontal:14,marginTop:2,borderLeftWidth:3},
  freeSlot:        {flexDirection:'row',alignItems:'center',gap:10,padding:10,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#F9FAFB'},
  freeDot:         {width:9,height:9,borderRadius:4.5,backgroundColor:'#22C55E'},
  freeSlotTier:    {fontSize:14,fontWeight:'700',color:C.text},
  freeSlotTime:    {fontSize:12,color:C.text3,marginTop:1},
  freeTag:         {backgroundColor:'#DCFCE7',paddingHorizontal:9,paddingVertical:3,borderRadius:5},
  freeTagTx:       {fontSize:11,fontWeight:'700',color:'#15803D'},
  occWrap:         {padding:10,paddingHorizontal:14,backgroundColor:'#FAFAFA',borderTopWidth:1,borderTopColor:'#F3F4F6'},
  occLabel:        {fontSize:11,color:C.text3,marginBottom:3},
  occChip:         {paddingHorizontal:8,paddingVertical:3,borderRadius:4,borderWidth:1},

  // Upload
  infoBanner:      {backgroundColor:'#F0F9FF',borderRadius:10,padding:14,borderWidth:1,borderColor:'#BAE6FD',marginBottom:14},
  infoBannerTitle: {fontSize:14,fontWeight:'700',color:'#0369A1',marginBottom:4},
  infoBannerTx:    {fontSize:13,color:'#0284C7',lineHeight:18},
  uploadBtn:       {borderRadius:12,borderWidth:2,borderColor:C.border,borderStyle:'dashed',padding:24,alignItems:'center',marginBottom:12,backgroundColor:C.white},
  uploadBtnTitle:  {fontSize:15,fontWeight:'700',color:C.text,marginBottom:4},
  uploadBtnSub:    {fontSize:13,color:C.text3},
  progressBox:     {backgroundColor:C.white,borderRadius:12,padding:28,alignItems:'center'},
  progressTitle:   {fontSize:15,fontWeight:'700',color:C.text,marginBottom:14},
  progressTrack:   {width:'100%',height:8,backgroundColor:'#F3F4F6',borderRadius:100,overflow:'hidden'},
  progressFill:    {height:'100%',backgroundColor:C.red,borderRadius:100},
  doneBox:         {backgroundColor:C.white,borderRadius:12,overflow:'hidden'},

  // Notif
  notifBanner:     {borderRadius:12,padding:14,marginBottom:14,flexDirection:'row',alignItems:'center',borderWidth:1.5},
  notifBannerTitle:{fontSize:15,fontWeight:'700',marginBottom:2},
  notifBannerSub:  {fontSize:13},
  sampleCard:      {backgroundColor:C.white,borderRadius:10,padding:13,flexDirection:'row',gap:12,alignItems:'flex-start',borderLeftWidth:4,borderLeftColor:C.red,marginBottom:14,shadowColor:'#000',shadowOpacity:.05,shadowRadius:3,elevation:1},
  sampleIcon:      {width:40,height:40,backgroundColor:'#FEF2F2',borderRadius:9,alignItems:'center',justifyContent:'center'},
  sampleLabel:     {fontSize:10,color:C.red,fontWeight:'700',marginBottom:3,letterSpacing:.5},
  sampleTitle:     {fontSize:14,fontWeight:'700',color:C.text,marginBottom:2},
  sampleSub:       {fontSize:12,color:C.text3},
  card:            {backgroundColor:C.white,borderRadius:10,overflow:'hidden',borderWidth:1,borderColor:C.border},
  cardHead:        {padding:12,paddingHorizontal:14,backgroundColor:'#FAFAFA',borderBottomWidth:1,borderBottomColor:'#F3F4F6',fontSize:15,fontWeight:'700',color:C.text},
  settingRow:      {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:13,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#F9FAFB'},
  settingLabel:    {fontSize:14,fontWeight:'600',color:C.text,marginBottom:2},
  settingSub:      {fontSize:12,color:C.text3},
  disabledHint:    {padding:10,fontSize:12,color:C.text3,textAlign:'center',borderTopWidth:1,borderTopColor:'#F3F4F6',fontStyle:'italic'},
  notifRow:        {flexDirection:'row',alignItems:'center',gap:10,padding:12,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#F9FAFB'},
  notifBar:        {width:4,height:44,borderRadius:2},
  notifDay:        {fontSize:12,fontWeight:'700',marginBottom:2},
  notifName:       {fontSize:14,fontWeight:'700',color:C.text,marginBottom:2},
  notifMeta:       {fontSize:11,color:C.text3},
  notifBadge:      {paddingHorizontal:10,paddingVertical:4,borderRadius:6},
});
