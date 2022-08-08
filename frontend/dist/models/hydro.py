from typing import TypedDict
import math
from cmath import nan, pi


class Town(TypedDict):
    pv: float
    wind: float
    ocean_dist: float
    waterbodies_dist: float
    waterway_dist: float
    grid_dist: float
    theo_pv: float
    theo_wind: float


class Pars(TypedDict):
    pv_capex: float
    wind_capex: float
    ely_capex: float
    min_area: float
    water_tran_cost: float
    elec_ocean_water_treatment: float
    interest_rate: float
    h2_state: str
    elec_water_treatment: float
    water_resource: str
    h2_trans_cost: float
    wind_dist: float
    pv_size: float


class C:
    pv_lifetime: float = 20
    pv_opex: float = 9.3              # €/kWp*a

    wind_lifetime = 20
    wind_opex = 40                    # €/kW*a

    ely_capex: float = 1280  # €/kW
    ely_opex: float = 0.02  # % CAPEX/a
    ely_lt: float = 10  # a
    ely_eff: float = 0.6
    ely_cap: float = 0.6
    ely_water: float = 10  # liter/kg

    water_spec_cost: float = 1.2  # €/m3
    h2_en_den: float = 33.33  # kWh/kgh2
    energy_liquid: float = 9  # kWh/kgh2
    ely_output_pressure: float = 30  # bar


class Result(TypedDict):
    #tech: str
    #elec_technology: str
    #cost_elec_pv: float
    wind: float
    #cost_elec: float
    #cost_h2: float
    #cost_h2_ocean: float
    #turbine_output: float
    #pv_radiation: float
    #h2_cost_to_demand: float
    #pv_kWh: float
    #wind_kWh: float


def pvf(interestrate: float, lifetime: float) -> float:
    """
    Function present value facto
    """
    return float(
        (((1 + interestrate) ** lifetime) - 1)
        / (((1 + interestrate) ** lifetime) * interestrate)
    )


def LCOE_wind(town: Town, pars: Pars) -> float:

    cp = 0.45                       #Coefficient of performance wind turbine 
    den_air = 1.21                  #Air density in kg/m3
    d_rot = 82                      #Diameter of rotor in kg/m3
    field_eff = 0.95
    availability = 0.98
    p_turb = 2300

    start_speed = 3                     #[m/s]
    switchoff_speed = 34                #[m/s]

    wind_hourly_output = []
    input_ely_wind = []
        
    v_m = town['wind']                       # [m/s] mean wind speed
    A = v_m *(2/(pi**0.5))
    annual_power_output = 0


    for p in range((int(switchoff_speed))):

        if (p+1) < start_speed:
            annual_power_output = annual_power_output + 0
            windspeed_probability = (1-math.exp(-(((p+1+0.5)/A)**2)))-(1-math.exp(-(((p+1-0.5)/A)**2)))

            for h in range(round(8760*windspeed_probability)):
                wind_hourly_output.append(0)

        elif (p+1) == switchoff_speed:
            annual_power_output = annual_power_output + 0
            windspeed_probability = (1-math.exp(-(((p+1+0.5)/A)**2)))-(1-math.exp(-(((p+1-0.5)/A)**2)))

            for h in range(round(8760*windspeed_probability)):
                wind_hourly_output.append(0)
            
        else:
            windspeed_output = 0.5 * cp * den_air * ((82**2)*pi/4) * ((p+1) ** 3) * field_eff * availability
            windspeed_probability = (1-math.exp(-(((p+1+0.5)/A)**2)))-(1-math.exp(-(((p+1-0.5)/A)**2)))

            if (windspeed_output/1000) > p_turb:
                annual_power_output = annual_power_output + windspeed_probability*p_turb*8760
                for h in range(round(8760*windspeed_probability)):
                    wind_hourly_output.append(p_turb)
            else:
                annual_power_output = annual_power_output + windspeed_probability*windspeed_output*8760/1000

                for h in range(round(8760*windspeed_probability)):
                    wind_hourly_output.append(windspeed_output/1000)

    turb_out = annual_power_output / p_turb
    wind_elec_cost_hex = ((pars['wind_capex']/pvf(pars['interest_rate']/100,C.wind_lifetime)+C.wind_opex)/turb_out) * 1000

    if wind_elec_cost_hex > 200:
        wind_elec_cost_hex = 200

    return wind_elec_cost_hex

def LCOE_pv(town: Town, pars: Pars) -> float:

    pv_elec_cost_hex = (((pars['pv_capex']/pvf(pars['interest_rate']/100,C.pv_lifetime))+C.pv_opex)/town['pv']/365) * 1000
    
    return pv_elec_cost_hex



def model(town: Town, pars: Pars) -> Result:

    wind_lcoe = LCOE_wind(town,pars)
    pv_lcoe = LCOE_pv(town,pars)


    return dict(

        wind_lcoe=max(0, wind_lcoe),
        pv_lcoe=max(0, pv_lcoe),

    )

    