package com.mercadocentral.conteo;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(com.getcapacitor.community.speechrecognition.SpeechRecognition.class);
        super.onCreate(savedInstanceState);
    }
}
