import React from "react";
import { useAppThemeContext } from "../AppThemeProvider";
import classes from './Switch.module.css';

const SwitchCustom = ({checked, onChange, name, disabled = false}) => {
  const {appTheme} = useAppThemeContext();

  const onActive = () => {
    if (disabled) return;
    onChange(!checked, name, !checked);
  };

  return (
    <div
      className={[classes.switch, checked ? classes['switch--active'] : '', disabled ? classes['switch--disabled'] : ''].join(' ')}
      onClick={onActive}>
      <div className={[classes.toggle, classes[`toggle--${appTheme}`]].join(' ')}>
      </div>

      <div className={[classes.track, classes[`track--${appTheme}`]].join(' ')}>
      </div>
    </div>
  );
};

export default SwitchCustom;
