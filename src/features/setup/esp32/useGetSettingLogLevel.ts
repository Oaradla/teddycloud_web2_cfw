// @ts-nocheck -- written for the looser compiler settings of teddycloud_web
// Taken over from teddycloud_web src/hooks/getsettings/useGetSettingLogLevel.ts (revision 5227a59); maintained here since.
import { useEffect, useState } from "react";
import { TeddyCloudApi, defaultAPIConfig } from "./shims";

const api = new TeddyCloudApi(defaultAPIConfig());

export const useGetSettingLogLevel = () => {
    const [value, setValue] = useState<number>(0);

    useEffect(() => {
        let isMounted = true;

        const fetchSetting = async () => {
            try {
                const response = await api.apiGetTeddyCloudSettingRaw("log.level");
                const v = await response.text();
                if (isMounted) setValue(Number(v));
            } catch {
                if (isMounted) setValue(Number(0));
            }
        };

        fetchSetting();
        return () => {
            isMounted = false;
        };
    }, []);

    return value;
};
