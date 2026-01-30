const fetch = require('node-fetch');
(async ()=>{
  for (let port=4000; port<=4003; port++){
    try{
      console.log('fetching', port);
      const res = await fetch(`http://127.0.0.1:${port}/resolve/test`, { timeout: 500 });
      console.log('port', port, 'status', res.status);
      const text = await res.text();
      console.log('body:', text.slice(0,120));
    }catch(e){
      console.error('port', port, 'err', e.message);
    }
  }
})();